import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomBytes } from "crypto";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

const membershipRoleItem = type({
  role_name: "string",
  track_name: "string",
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
});
userSchema.onUndeclaredKey("delete");

export type User = typeof userSchema.infer;

interface DocumentUser extends User {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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
  private readonly cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID!;

  private constructor() {}

  public static make() {
    if (!UserStore.client) {
      const dynamoDbClient = new DynamoDBClient(
        import.meta.env.MODE === "test"
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
      UserStore.cognito = new CognitoIdentityProviderClient();
    }
    return new UserStore();
  }

  public async getUser(user_id: string): Promise<DocumentUser> {
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentUser,
    });
    await UserStore.client.send(command);
    return documentUser;
  }

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

  public async deleteUser(user_id: string) {
    const existingUser = await this.getUser(user_id);
    const now = new Date().toISOString();
    const deletedUser: DocumentUser = {
      ...existingUser,
      user_id: existingUser.user_id,
      created_at: existingUser.created_at,
      updated_at: now,
      deleted_at: now,
    };

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
