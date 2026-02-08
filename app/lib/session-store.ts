import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export const SessionSchema = type({
  user_id: "string",
  session_id: "string",
  expires_at: "number",
  refresh_token: "string",
  access_token: "string",
  access_token_expires_at: "string",
});

SessionSchema.onUndeclaredKey("delete");

export type Session = typeof SessionSchema.infer;

interface DocumentSession extends Session {
  created_at: string;
  updated_at: string;
}

export class SessionNotFound extends Error {
  constructor(user_id: string, session_id: string) {
    super(`Session not found: ${user_id}/${session_id}`);
  }
}

export class SessionStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_user_sessions";

  private constructor() {}

  public static make() {
    if (!SessionStore.client) {
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
      SessionStore.client = DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new SessionStore();
  }

  public async getSession(
    user_id: string,
    session_id: string,
  ): Promise<DocumentSession> {
    if (!user_id || !session_id) {
      throw new SessionNotFound(user_id, session_id);
    }
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        user_id,
        session_id,
      },
    });
    const response = await SessionStore.client.send(command);
    if (!response.Item) {
      throw new SessionNotFound(user_id, session_id);
    }
    return response.Item as unknown as DocumentSession;
  }

  public async createSession(session: Session): Promise<DocumentSession> {
    const documentSession: DocumentSession = {
      ...session,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentSession,
    });
    await SessionStore.client.send(command);
    return documentSession;
  }

  public async updateSession(session: Session): Promise<DocumentSession> {
    const existing = await this.getSession(session.user_id, session.session_id);

    const documentSession: DocumentSession = {
      ...session,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentSession,
    });
    await SessionStore.client.send(command);
    return documentSession;
  }

  public async deleteSession(
    user_id: string,
    session_id: string,
  ): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        user_id,
        session_id,
      },
    });
    await SessionStore.client.send(command);
  }

  public async listUserSessions(user_id: string): Promise<DocumentSession[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "user_id = :user_id",
      ExpressionAttributeValues: {
        ":user_id": user_id,
      },
    });
    const response = await SessionStore.client.send(command);
    return (response.Items || []) as unknown as DocumentSession[];
  }

  public async deleteAllUserSessions(user_id: string): Promise<void> {
    const sessions = await this.listUserSessions(user_id);
    await Promise.all(
      sessions.map((session) =>
        this.deleteSession(session.user_id, session.session_id),
      ),
    );
  }
}
