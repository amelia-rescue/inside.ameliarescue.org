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

export const truckCheckSchema = type({
  id: "string",
  created_by: "string",
  truck: "string",
  data: "Record<string, unknown>",
  contributors: "string[]",
  locked: "boolean",
});
truckCheckSchema.onUndeclaredKey("delete");

export type TruckCheck = typeof truckCheckSchema.infer;

interface DocumentTruckCheck extends TruckCheck {
  created_at: string;
  updated_at: string;
}

export class TruckCheckNotFound extends Error {
  constructor(id: string) {
    super(`Truck check not found: ${id}`);
  }
}

export class TruckCheckAlreadyExists extends Error {
  constructor(id: string) {
    super(`Truck check already exists: ${id}`);
  }
}

export class TruckCheckStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_truck_checks";

  private constructor() {}

  public static make() {
    if (!TruckCheckStore.client) {
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
      TruckCheckStore.client = DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new TruckCheckStore();
  }

  public async getTruckCheck(id: string): Promise<DocumentTruckCheck> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        id,
      },
    });
    const response = await TruckCheckStore.client.send(command);
    if (!response.Item) {
      throw new TruckCheckNotFound(id);
    }
    return response.Item as unknown as DocumentTruckCheck;
  }

  public async createTruckCheck(
    truckCheck: Omit<TruckCheck, "id">,
  ): Promise<DocumentTruckCheck> {
    const documentTruckCheck: DocumentTruckCheck = {
      ...truckCheck,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTruckCheck,
      ConditionExpression: "attribute_not_exists(id)",
    });
    await TruckCheckStore.client.send(command);
    return documentTruckCheck;
  }

  public async updateTruckCheck(
    truckCheck: TruckCheck,
  ): Promise<DocumentTruckCheck> {
    const existing = await this.getTruckCheck(truckCheck.id);

    const documentTruckCheck: DocumentTruckCheck = {
      ...truckCheck,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTruckCheck,
    });
    await TruckCheckStore.client.send(command);
    return documentTruckCheck;
  }

  public async deleteTruckCheck(id: string): Promise<void> {
    await this.getTruckCheck(id);

    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        id,
      },
    });
    await TruckCheckStore.client.send(command);
  }

  public async listTruckChecks(): Promise<DocumentTruckCheck[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });
    const response = await TruckCheckStore.client.send(command);
    return (response.Items || []) as unknown as DocumentTruckCheck[];
  }
}
