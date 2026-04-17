import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export interface EmailEventHistory {
  event_type: string;
  event_at: string;
  details?: Record<string, unknown>;
}

export const emailEventSchema = type({
  message_id: "string",
  origin: '"app"|"cognito"|"ses_callback"',
  status: "string",
  to_emails: "string[]",
  "subject?": "string",
  "source_email?": "string",
  "sent_at?": "string",
  "last_event_at?": "string",
  "last_event_type?": "string",
  "bounce_type?": "string",
  "bounce_sub_type?": "string",
  "complaint_feedback_type?": "string",
  "delivery_delay_type?": "string",
  "last_sns_message_id?": "string",
  "tags?": "Record<string, string[]>",
});
emailEventSchema.onUndeclaredKey("delete");

type EmailEventBase = typeof emailEventSchema.infer;

export type EmailEvent = EmailEventBase & {
  events: EmailEventHistory[];
};

interface DocumentEmailEvent extends EmailEvent {
  list_partition: string;
  list_sort: string;
  created_at: string;
  updated_at: string;
}

export class EmailEventNotFound extends Error {
  constructor(messageId: string) {
    super(`Email event not found: ${messageId}`);
  }
}

export class EmailEventStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_email_events";
  private readonly listPartition = "EMAIL_EVENTS";

  private constructor() {}

  public static make() {
    if (!EmailEventStore.client) {
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
      EmailEventStore.client = DynamoDBDocumentClient.from(dynamoDbClient, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });
    }

    return new EmailEventStore();
  }

  public async getEmailEvent(messageId: string): Promise<DocumentEmailEvent> {
    const response = await EmailEventStore.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          message_id: messageId,
        },
      }),
    );

    if (!response.Item) {
      throw new EmailEventNotFound(messageId);
    }

    return response.Item as DocumentEmailEvent;
  }

  public async createSentEmailEvent(params: {
    messageId: string;
    toEmails: string[];
    subject: string;
    sourceEmail?: string;
    sentAt?: string;
    origin?: "app" | "cognito" | "ses_callback";
    status?: string;
    tags?: Record<string, string[]>;
  }): Promise<DocumentEmailEvent> {
    const timestamp = params.sentAt ?? new Date().toISOString();
    const now = new Date().toISOString();
    const documentEmailEvent: DocumentEmailEvent = {
      message_id: params.messageId,
      origin: params.origin ?? "app",
      status: params.status ?? "SEND",
      to_emails: params.toEmails,
      subject: params.subject,
      source_email: params.sourceEmail,
      sent_at: timestamp,
      last_event_at: timestamp,
      last_event_type: params.status ?? "SEND",
      tags: params.tags,
      events: [
        {
          event_type: params.status ?? "SEND",
          event_at: timestamp,
          details: {
            source_email: params.sourceEmail,
            to_emails: params.toEmails,
            subject: params.subject,
          },
        },
      ],
      list_partition: this.listPartition,
      list_sort: this.makeListSort(timestamp, params.messageId),
      created_at: now,
      updated_at: now,
    };

    await EmailEventStore.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: documentEmailEvent,
        ConditionExpression: "attribute_not_exists(message_id)",
      }),
    );

    return documentEmailEvent;
  }

  public async upsertStatusFromSesCallback(params: {
    messageId: string;
    eventType: string;
    eventAt: string;
    snsMessageId?: string;
    toEmails: string[];
    subject?: string;
    sourceEmail?: string;
    tags?: Record<string, string[]>;
    origin?: "app" | "cognito" | "ses_callback";
    details?: Record<string, unknown>;
    bounceType?: string;
    bounceSubType?: string;
    complaintFeedbackType?: string;
    deliveryDelayType?: string;
  }): Promise<DocumentEmailEvent> {
    const now = new Date().toISOString();

    try {
      const existing = await this.getEmailEvent(params.messageId);
      const nextOrigin =
        existing.origin === "app"
          ? "app"
          : (params.origin ?? existing.origin ?? "ses_callback");
      const nextSubject = existing.subject ?? params.subject;
      const nextSourceEmail = existing.source_email ?? params.sourceEmail;
      const nextToEmails =
        existing.to_emails.length > 0 ? existing.to_emails : params.toEmails;
      const nextTags = existing.tags ?? params.tags;
      const nextEvents = [
        ...existing.events,
        {
          event_type: params.eventType,
          event_at: params.eventAt,
          details: params.details,
        },
      ];

      const updates: Record<string, { name: string; value: unknown }> = {
        origin: { name: "origin", value: nextOrigin },
        status: { name: "status", value: params.eventType },
        to_emails: { name: "to_emails", value: nextToEmails },
        last_event_at: { name: "last_event_at", value: params.eventAt },
        last_event_type: { name: "last_event_type", value: params.eventType },
        events: { name: "events", value: nextEvents },
        list_partition: { name: "list_partition", value: this.listPartition },
        list_sort: {
          name: "list_sort",
          value: this.makeListSort(
            params.eventAt ?? existing.sent_at ?? existing.created_at,
            params.messageId,
          ),
        },
        updated_at: { name: "updated_at", value: now },
      };

      if (nextSubject !== undefined) {
        updates.subject = { name: "subject", value: nextSubject };
      }
      if (nextSourceEmail !== undefined) {
        updates.source_email = { name: "source_email", value: nextSourceEmail };
      }
      if (params.snsMessageId !== undefined) {
        updates.last_sns_message_id = {
          name: "last_sns_message_id",
          value: params.snsMessageId,
        };
      }
      if (params.bounceType !== undefined) {
        updates.bounce_type = { name: "bounce_type", value: params.bounceType };
      }
      if (params.bounceSubType !== undefined) {
        updates.bounce_sub_type = {
          name: "bounce_sub_type",
          value: params.bounceSubType,
        };
      }
      if (params.complaintFeedbackType !== undefined) {
        updates.complaint_feedback_type = {
          name: "complaint_feedback_type",
          value: params.complaintFeedbackType,
        };
      }
      if (params.deliveryDelayType !== undefined) {
        updates.delivery_delay_type = {
          name: "delivery_delay_type",
          value: params.deliveryDelayType,
        };
      }
      if (nextTags !== undefined) {
        updates.tags = { name: "tags", value: nextTags };
      }

      const setClauses: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};
      let index = 0;
      for (const [, update] of Object.entries(updates)) {
        const nameKey = `#f${index}`;
        const valueKey = `:v${index}`;
        setClauses.push(`${nameKey} = ${valueKey}`);
        expressionAttributeNames[nameKey] = update.name;
        expressionAttributeValues[valueKey] = update.value;
        index++;
      }

      const response = await EmailEventStore.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            message_id: params.messageId,
          },
          ConditionExpression: "attribute_exists(message_id)",
          UpdateExpression: `SET ${setClauses.join(", ")}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: "ALL_NEW",
        }),
      );

      return response.Attributes as DocumentEmailEvent;
    } catch (error) {
      if (!(error instanceof EmailEventNotFound)) {
        const isConditionalCheckFailure =
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "ConditionalCheckFailedException";
        if (!isConditionalCheckFailure) {
          throw error;
        }
      }
    }

    const documentEmailEvent: DocumentEmailEvent = {
      message_id: params.messageId,
      origin: params.origin ?? "ses_callback",
      status: params.eventType,
      to_emails: params.toEmails,
      subject: params.subject,
      source_email: params.sourceEmail,
      sent_at: undefined,
      last_event_at: params.eventAt,
      last_event_type: params.eventType,
      bounce_type: params.bounceType,
      bounce_sub_type: params.bounceSubType,
      complaint_feedback_type: params.complaintFeedbackType,
      delivery_delay_type: params.deliveryDelayType,
      last_sns_message_id: params.snsMessageId,
      tags: params.tags,
      events: [
        {
          event_type: params.eventType,
          event_at: params.eventAt,
          details: params.details,
        },
      ],
      list_partition: this.listPartition,
      list_sort: this.makeListSort(params.eventAt, params.messageId),
      created_at: now,
      updated_at: now,
    };

    await EmailEventStore.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: documentEmailEvent,
      }),
    );

    return documentEmailEvent;
  }

  public async listRecentEmailEvents(
    limit = 100,
  ): Promise<DocumentEmailEvent[]> {
    const response = await EmailEventStore.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "RecentEventsIndex",
        KeyConditionExpression: "list_partition = :listPartition",
        ExpressionAttributeValues: {
          ":listPartition": this.listPartition,
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );

    return (response.Items || []) as DocumentEmailEvent[];
  }

  private makeListSort(timestamp: string, messageId: string): string {
    return `${timestamp}#${messageId}`;
  }
}
