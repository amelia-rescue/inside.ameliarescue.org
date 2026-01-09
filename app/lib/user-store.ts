import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynaliteEndpoint } from "./util";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  membership_status?: "provider" | "driver_only" | "junior";
  provider_level?: "cpr" | "basic" | "advanced" | "paramedic";
  cpr_certification_url?: string;
  provider_certification_url?: string;
  evoc_certification_url?: string;
  certifications?: string[];
  recentActivity?: string[];
}

export class UserNotFound extends Error {
  constructor() {
    super("User not found");
  }
}

/**
 * This thing is a singleton which could potentially screw up
 * tests because you can only have one instance of the client
 * with a single endpoint. If you were to use multiple instances
 * of dynalite in parallel, this shit would break so don't do it.
 */
export class UserStore {
  private static client: DynamoDBDocumentClient;
  private tableName = "aes_users";

  private constructor() {}

  public static make(endpoint?: DynaliteEndpoint) {
    if (!UserStore.client) {
      const dynamoDbClient = new DynamoDBClient(
        endpoint
          ? {
              endpoint,
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
    return new UserStore();
  }

  public static reset() {
    UserStore.client = undefined as unknown as DynamoDBDocumentClient;
  }

  public async getUser(id: string): Promise<User> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        id,
      },
    });
    const response = await UserStore.client.send(command);
    if (!response.Item) {
      throw new UserNotFound();
    }
    return response.Item as unknown as User;
  }

  public async createUser(user: User): Promise<void> {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: user,
    });
    await UserStore.client.send(command);
  }
}
