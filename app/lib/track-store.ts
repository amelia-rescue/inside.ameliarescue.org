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

export const trackSchema = type({
  name: "string",
  description: "string",
  required_certifications: "string[]",
});
trackSchema.onUndeclaredKey("delete");

export type Track = typeof trackSchema.infer;

interface DocumentTrack extends Track {
  created_at: string;
  updated_at: string;
}

export class TrackNotFound extends Error {
  constructor(name: string) {
    super(`Track not found: ${name}`);
  }
}

export class TrackAlreadyExists extends Error {
  constructor(name: string) {
    super(`Track already exists: ${name}`);
  }
}

export class TrackStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_tracks";

  private constructor() {}

  public static make() {
    if (!TrackStore.client) {
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
      TrackStore.client = DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new TrackStore();
  }

  public async getTrack(name: string): Promise<DocumentTrack> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        name,
      },
    });
    const response = await TrackStore.client.send(command);
    if (!response.Item) {
      throw new TrackNotFound(name);
    }
    return response.Item as unknown as DocumentTrack;
  }

  public async createTrack(track: Track): Promise<DocumentTrack> {
    try {
      await this.getTrack(track.name);
      throw new TrackAlreadyExists(track.name);
    } catch (error) {
      if (!(error instanceof TrackNotFound)) {
        throw error;
      }
    }

    const documentTrack: DocumentTrack = {
      ...track,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTrack,
      ConditionExpression: "attribute_not_exists(#name)",
      ExpressionAttributeNames: {
        "#name": "name",
      },
    });
    await TrackStore.client.send(command);
    return documentTrack;
  }

  public async updateTrack(track: Track): Promise<DocumentTrack> {
    const existing = await this.getTrack(track.name);

    const documentTrack: DocumentTrack = {
      ...track,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTrack,
    });
    await TrackStore.client.send(command);
    return documentTrack;
  }

  public async deleteTrack(name: string): Promise<void> {
    await this.getTrack(name);

    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: { name },
    });
    await TrackStore.client.send(command);
  }

  public async listTracks(): Promise<DocumentTrack[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });
    const response = await TrackStore.client.send(command);
    return (response.Items || []) as unknown as DocumentTrack[];
  }
}
