import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "../dynalite-endpont";

export const certificationReminderSchema = type({
  reminder_id: "string",
  user_id: "string",
  certification_id: "string",
  reminder_type: "'expired' | 'expiring_soon' | 'missing'",
  sent_at: "string",
  "email_sent?": "boolean",
  "sms_sent?": "boolean",
});
certificationReminderSchema.onUndeclaredKey("delete");

export type CertificationReminder = typeof certificationReminderSchema.infer;

interface DocumentCertificationReminder extends CertificationReminder {
  created_at: string;
  updated_at: string;
}

export class CertificationReminderNotFound extends Error {
  constructor() {
    super("Certification reminder not found");
  }
}

export class CertificationReminderAlreadyExists extends Error {
  constructor() {
    super("Certification reminder already exists");
  }
}

export class CertificationReminderStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  static make(): CertificationReminderStore {
    const isTest = process.env.NODE_ENV === "test";
    const client = new DynamoDBClient(
      isTest
        ? {
            endpoint: DYNALITE_ENDPOINT,
            region: "us-east-1",
            credentials: {
              accessKeyId: "dummy",
              secretAccessKey: "dummy",
            },
          }
        : {},
    );
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName =
      process.env.CERTIFICATION_REMINDERS_TABLE_NAME ||
      "aes_certification_reminders";
    return new CertificationReminderStore(docClient, tableName);
  }

  async createReminder(
    reminder: CertificationReminder,
  ): Promise<DocumentCertificationReminder> {
    const validated = certificationReminderSchema(reminder);
    if (validated instanceof type.errors) {
      throw new Error(validated.summary);
    }

    const existingReminder = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { reminder_id: reminder.reminder_id },
      }),
    );

    if (existingReminder.Item) {
      throw new CertificationReminderAlreadyExists();
    }

    const now = new Date().toISOString();
    const documentReminder: DocumentCertificationReminder = {
      ...validated,
      created_at: now,
      updated_at: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: documentReminder,
      }),
    );

    return documentReminder;
  }

  async getReminder(
    reminderId: string,
  ): Promise<DocumentCertificationReminder> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { reminder_id: reminderId },
      }),
    );

    if (!result.Item) {
      throw new CertificationReminderNotFound();
    }

    return result.Item as DocumentCertificationReminder;
  }

  async getRemindersByUserAndCertification(
    userId: string,
    certificationId: string,
  ): Promise<DocumentCertificationReminder[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "UserIdIndex",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "certification_id = :certificationId",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":certificationId": certificationId,
        },
        ScanIndexForward: false,
      }),
    );

    return (result.Items || []) as DocumentCertificationReminder[];
  }

  async getRemindersByUser(
    userId: string,
  ): Promise<DocumentCertificationReminder[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "UserIdIndex",
        KeyConditionExpression: "user_id = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false,
      }),
    );

    return (result.Items || []) as DocumentCertificationReminder[];
  }

  async listAllReminders(): Promise<DocumentCertificationReminder[]> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
      }),
    );

    return (result.Items || []) as DocumentCertificationReminder[];
  }

  async updateReminder(
    reminder: CertificationReminder,
  ): Promise<DocumentCertificationReminder> {
    const validated = certificationReminderSchema(reminder);
    if (validated instanceof type.errors) {
      throw new Error(validated.summary);
    }

    const existingReminder = await this.getReminder(reminder.reminder_id);

    const now = new Date().toISOString();
    const updatedReminder: DocumentCertificationReminder = {
      ...existingReminder,
      ...validated,
      updated_at: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updatedReminder,
      }),
    );

    return updatedReminder;
  }

  async deleteReminder(reminderId: string): Promise<void> {
    const existingReminder = await this.getReminder(reminderId);

    if (!existingReminder) {
      throw new CertificationReminderNotFound();
    }

    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { reminder_id: reminderId },
      }),
    );
  }

  async hasReminderOfType(
    userId: string,
    certificationId: string,
    reminderType: CertificationReminder["reminder_type"],
  ): Promise<boolean> {
    const reminders = await this.getRemindersByUserAndCertification(
      userId,
      certificationId,
    );

    return reminders.some(
      (reminder) => reminder.reminder_type === reminderType,
    );
  }
}
