import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export const roleSchema = type({
  name: "string",
  description: "string",
  allowed_tracks: "string[]",
});
roleSchema.onUndeclaredKey("delete");

export type Role = typeof roleSchema.infer;

interface DocumentRole extends Role {
  created_at: string;
  updated_at: string;
}

export class RoleNotFound extends Error {
  constructor(name: string) {
    super(`Role not found: ${name}`);
  }
}

export class RoleAlreadyExists extends Error {
  constructor(name: string) {
    super(`Role already exists: ${name}`);
  }
}

export class RoleStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_roles";

  private constructor() {}

  public static make() {
    if (!RoleStore.client) {
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
      RoleStore.client = DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new RoleStore();
  }

  public async getRole(name: string): Promise<DocumentRole> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        name,
      },
    });
    const response = await RoleStore.client.send(command);
    if (!response.Item) {
      throw new RoleNotFound(name);
    }
    return response.Item as unknown as DocumentRole;
  }

  public async createRole(role: Role): Promise<DocumentRole> {
    try {
      await this.getRole(role.name);
      throw new RoleAlreadyExists(role.name);
    } catch (error) {
      if (!(error instanceof RoleNotFound)) {
        throw error;
      }
    }

    const documentRole: DocumentRole = {
      ...role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentRole,
      ConditionExpression: "attribute_not_exists(#name)",
      ExpressionAttributeNames: {
        "#name": "name",
      },
    });
    await RoleStore.client.send(command);
    return documentRole;
  }

  public async updateRole(role: Role): Promise<DocumentRole> {
    const existing = await this.getRole(role.name);

    const documentRole: DocumentRole = {
      ...role,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentRole,
    });
    await RoleStore.client.send(command);
    return documentRole;
  }

  public async deleteRole(name: string): Promise<void> {
    await this.getRole(name);

    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        name,
      },
    });
    await RoleStore.client.send(command);
  }

  public async listRoles(): Promise<DocumentRole[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });
    const response = await RoleStore.client.send(command);
    return (response.Items || []) as unknown as DocumentRole[];
  }
}
