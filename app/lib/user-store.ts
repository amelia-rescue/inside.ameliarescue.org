import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserStatusType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomBytes } from "crypto";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";
import { log } from "./logger";

const membershipRoleItem = type({
  role_name: "string",
  track_name: "string",
  precepting: "boolean",
});

export const userSchema = type({
  user_id: "string",
  first_name: "string",
  last_name: "string",
  email: "string",
  website_role: "'admin' | 'user'",
  membership_roles: membershipRoleItem.array(),
  "phone?": "string",
  "profile_picture_url?": "string",
  "last_login_at?": "string",
  "temporary_password_expires_at?": "string",
  "note?": "string",
  "truck_check_issue_emails?": "boolean",
});
userSchema.onUndeclaredKey("delete");

export type User = typeof userSchema.infer;

export interface DocumentUser extends User {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface UserWithAccountStatus extends DocumentUser {
  cognito_status: UserStatusType | null;
}

export class UserNotFound extends Error {
  constructor() {
    super("User not found");
  }
}

/**
 * todo: correct this comment - it's technically not a singleton
 *
 * This thing is a singleton which could potentially screw up
 * tests because you can only have one instance of the client
 * with a single endpoint. If you were to use multiple instances
 * of dynalite in parallel, this shit would break so don't do it.
 */
export class UserStore {
  private static client: DynamoDBDocumentClient;
  private static cognito: CognitoIdentityProviderClient;
  private readonly tableName = "aes_users";
  private readonly cognitoUserPoolId =
    process.env.COGNITO_USER_POOL_ID || "inside-amelia-rescue-users";

  private constructor() {}

  public static make(params?: { cognito?: CognitoIdentityProviderClient }) {
    if (!UserStore.client) {
      const dynamoDbClient = new DynamoDBClient(
        process.env.NODE_ENV === "test"
          ? {
              endpoint: DYNALITE_ENDPOINT,
              region: "local",
              credentials: {
                accessKeyId: "local",
                secretAccessKey: "local",
              },
            }
          : {},
      );
      UserStore.client = DynamoDBDocumentClient.from(dynamoDbClient);
    }
    if (!UserStore.cognito) {
      UserStore.cognito =
        params?.cognito ?? new CognitoIdentityProviderClient();
    }
    return new UserStore();
  }

  public async getUser(
    user_id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DocumentUser> {
    const user = await this.getUserIncludingDeleted(user_id);
    if (!options?.includeDeleted && user.deleted_at) {
      throw new UserNotFound();
    }
    return user;
  }

  public async getByEmail(email: string): Promise<DocumentUser> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      FilterExpression: "attribute_not_exists(deleted_at)",
      ExpressionAttributeValues: {
        ":email": email,
      },
    });
    const response = await UserStore.client.send(command);
    const user = response.Items?.[0] as DocumentUser | undefined;
    if (!user) {
      throw new UserNotFound();
    }
    return user;
  }

  private async getUserIncludingDeleted(
    user_id: string,
  ): Promise<DocumentUser> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        user_id,
      },
    });
    const response = await UserStore.client.send(command);
    if (!response.Item) {
      throw new UserNotFound();
    }
    return response.Item as unknown as DocumentUser;
  }

  public async createUser(user: Omit<User, "user_id">): Promise<DocumentUser> {
    const temporary_password = this.generatePassword();
    const now = new Date();
    const temporaryPasswordExpiresAt = this.getTemporaryPasswordExpiration(now);

    const cognitoResponse = await UserStore.cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: this.cognitoUserPoolId,
        Username: user.email,
        UserAttributes: [
          {
            Name: "email",
            Value: user.email,
          },
          {
            Name: "given_name",
            Value: user.first_name,
          },
          {
            Name: "family_name",
            Value: user.last_name,
          },
        ],
        TemporaryPassword: temporary_password,
      }),
    );

    if (!cognitoResponse.User?.Username) {
      throw new Error("Failed to create user in Cognito");
    }

    // when creating a user the username must be an email
    // when retrieving a user the username is the user_id
    // nice job AWS...
    const user_id = cognitoResponse.User.Username;

    const documentUser: DocumentUser = {
      ...user,
      user_id,
      temporary_password_expires_at: temporaryPasswordExpiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentUser,
    });
    await UserStore.client.send(command);
    return documentUser;
  }

  public async setTemporaryPassword(user_id: string): Promise<{
    user: DocumentUser;
    temporaryPassword: string;
    temporaryPasswordExpiresAt: string;
  }> {
    const user = await this.getUser(user_id);
    const temporaryPassword = this.generatePassword();
    const temporaryPasswordExpiresAt = this.getTemporaryPasswordExpiration();

    await UserStore.cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.cognitoUserPoolId,
        Username: user.email,
        Password: temporaryPassword,
        Permanent: false,
      }),
    );

    await this.updateUser({
      user_id,
      temporary_password_expires_at: temporaryPasswordExpiresAt,
    });

    return {
      user: {
        ...user,
        temporary_password_expires_at: temporaryPasswordExpiresAt,
      },
      temporaryPassword,
      temporaryPasswordExpiresAt,
    };
  }

  /**
   * Lists all users in the database.
   * @param includeDeleted - Whether to include deleted users in the list.
   * @returns A promise that resolves to an array of users.
   */
  public async listUsers(includeDeleted = false): Promise<DocumentUser[]> {
    const command = new ScanCommand(
      includeDeleted
        ? {
            TableName: this.tableName,
          }
        : {
            TableName: this.tableName,
            FilterExpression: "attribute_not_exists(deleted_at)",
          },
    );
    const response = await UserStore.client.send(command);
    return response.Items as unknown as DocumentUser[];
  }

  public async listUsersWithAccountStatus(
    includeDeleted = false,
  ): Promise<UserWithAccountStatus[]> {
    const [users, cognitoUsers] = await Promise.all([
      this.listUsers(includeDeleted),
      this.listCognitoUsers(),
    ]);
    const statusesByEmail = new Map<string, UserStatusType>();
    for (const cognitoUser of cognitoUsers) {
      const email = this.getCognitoUserEmail(cognitoUser);
      if (email) {
        statusesByEmail.set(
          email,
          cognitoUser.UserStatus ?? ("UNKNOWN" as UserStatusType),
        );
      }
    }

    return users.map((user) => ({
      ...user,
      cognito_status: statusesByEmail.get(user.email.toLowerCase()) ?? null,
    }));
  }

  public async getUserWithAccountStatus(
    user_id: string,
  ): Promise<UserWithAccountStatus> {
    const user = await this.getUser(user_id);
    const escapedEmail = user.email.replace(/([\\"])/g, "\\$1");
    const cognitoUsers = await this.listCognitoUsers(
      `email = "${escapedEmail}"`,
    );
    const cognitoUser = cognitoUsers.find(
      (candidate) =>
        this.getCognitoUserEmail(candidate) === user.email.toLowerCase(),
    );

    return {
      ...user,
      cognito_status:
        cognitoUser?.UserStatus ??
        (cognitoUser ? ("UNKNOWN" as UserStatusType) : null),
    };
  }

  /**
   * Lists users who have opted in to truck check issue emails.
   */
  public async listTruckCheckIssueSubscribers(): Promise<DocumentUser[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression:
        "attribute_not_exists(deleted_at) AND truck_check_issue_emails = :subscribed",
      ExpressionAttributeValues: {
        ":subscribed": true,
      },
    });
    const response = await UserStore.client.send(command);
    return (response.Items ?? []) as unknown as DocumentUser[];
  }

  public async updateUser(
    user: Partial<User> & Pick<User, "user_id">,
  ): Promise<void> {
    const existingUser = await this.getUser(user.user_id);
    const updatedUser: DocumentUser = {
      ...existingUser,
      ...user,
      user_id: existingUser.user_id,
      created_at: existingUser.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: updatedUser,
      ConditionExpression: "attribute_exists(user_id)",
    });
    await UserStore.client.send(command);
  }

  public async softDelete(user_id: string): Promise<void> {
    const existingUser = await this.getUser(user_id, {
      includeDeleted: true,
    });

    // If already deleted, return early
    if (existingUser.deleted_at) {
      return;
    }

    const now = new Date().toISOString();
    const deletedUser: DocumentUser = {
      ...existingUser,
      user_id: existingUser.user_id,
      created_at: existingUser.created_at,
      updated_at: now,
      deleted_at: now,
    };

    // Delete user from Cognito - wrap in try-catch to handle errors gracefully
    try {
      await UserStore.cognito.send(
        new AdminDeleteUserCommand({
          UserPoolId: this.cognitoUserPoolId,
          Username: existingUser.email,
        }),
      );
    } catch (error) {
      log.error("Failed to delete user from Cognito", { error });
      // Continue with DynamoDB update even if Cognito fails
      // The user might already be deleted or the error might be transient
    }

    const command = new PutCommand({
      TableName: this.tableName,
      Item: deletedUser,
      ConditionExpression: "attribute_exists(user_id)",
    });
    await UserStore.client.send(command);
  }

  public async deletePermanently(user_id: string) {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        user_id,
      },
    });
    await UserStore.client.send(command);
  }

  private async listCognitoUsers(filter?: string): Promise<UserType[]> {
    const users: UserType[] = [];
    let paginationToken: string | undefined;

    do {
      const response = await UserStore.cognito.send(
        new ListUsersCommand({
          UserPoolId: this.cognitoUserPoolId,
          Filter: filter,
          Limit: 60,
          PaginationToken: paginationToken,
        }),
      );
      users.push(...(response.Users ?? []));
      paginationToken = response.PaginationToken;
    } while (paginationToken);

    return users;
  }

  private getCognitoUserEmail(user: UserType): string | undefined {
    return user.Attributes?.find(
      (attribute) => attribute.Name === "email",
    )?.Value?.toLowerCase();
  }

  private getTemporaryPasswordExpiration(now = new Date()): string {
    const validityDays = Number(
      process.env.TEMPORARY_PASSWORD_VALIDITY_DAYS ?? "60",
    );
    if (
      !Number.isInteger(validityDays) ||
      validityDays < 1 ||
      validityDays > 365
    ) {
      throw new Error("TEMPORARY_PASSWORD_VALIDITY_DAYS must be from 1 to 365");
    }

    return new Date(
      now.getTime() + validityDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  private generatePassword(): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const length = 10;

    const chars: string[] = [];
    while (chars.length < length) {
      const bytes = randomBytes(length);
      for (const b of bytes) {
        const maxUnbiased = 256 - (256 % alphabet.length);
        if (b >= maxUnbiased) {
          continue;
        }

        chars.push(alphabet[b % alphabet.length]);
        if (chars.length === length) {
          break;
        }
      }
    }

    return chars.join("");
  }
}
