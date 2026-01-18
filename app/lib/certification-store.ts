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
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export const certificationSchema = type({
  certification_id: "string",
  user_id: "string",
  certification_type_name: "string",
  file_url: "string",
  "expires_on?": "string",
  uploaded_at: "string",
});
certificationSchema.onUndeclaredKey("delete");

export type Certification = typeof certificationSchema.infer;

interface DocumentCertification extends Certification {
  created_at: string;
  updated_at: string;
}

export class CertificationNotFound extends Error {
  constructor() {
    super("Certification not found");
  }
}

export class CertificationAlreadyExists extends Error {
  constructor() {
    super("Certification already exists");
  }
}

export class CertificationStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  static make(): CertificationStore {
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
      process.env.USER_CERTIFICATIONS_TABLE_NAME || "aes_user_certifications";
    return new CertificationStore(docClient, tableName);
  }

  async createCertification(
    certification: Certification,
  ): Promise<DocumentCertification> {
    const validated = certificationSchema(certification);
    if (validated instanceof type.errors) {
      throw new Error(validated.summary);
    }

    const existingCertification = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { certification_id: certification.certification_id },
      }),
    );

    if (existingCertification.Item) {
      throw new CertificationAlreadyExists();
    }

    const now = new Date().toISOString();
    const documentCertification: DocumentCertification = {
      ...validated,
      created_at: now,
      updated_at: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: documentCertification,
      }),
    );

    return documentCertification;
  }

  async getCertification(
    certificationId: string,
  ): Promise<DocumentCertification> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { certification_id: certificationId },
      }),
    );

    if (!result.Item) {
      throw new CertificationNotFound();
    }

    return result.Item as DocumentCertification;
  }

  async listCertificationsByUser(
    userId: string,
  ): Promise<DocumentCertification[]> {
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

    return (result.Items || []) as DocumentCertification[];
  }

  async listAllCertifications(): Promise<DocumentCertification[]> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
      }),
    );

    return (result.Items || []) as DocumentCertification[];
  }

  async updateCertification(
    certification: Certification,
  ): Promise<DocumentCertification> {
    const validated = certificationSchema(certification);
    if (validated instanceof type.errors) {
      throw new Error(validated.summary);
    }

    const existingCertification = await this.getCertification(
      certification.certification_id,
    );

    const now = new Date().toISOString();
    const updatedCertification: DocumentCertification = {
      ...existingCertification,
      ...validated,
      updated_at: now,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: updatedCertification,
      }),
    );

    return updatedCertification;
  }

  async deleteCertification(certificationId: string): Promise<void> {
    const existingCertification = await this.getCertification(certificationId);

    if (!existingCertification) {
      throw new CertificationNotFound();
    }

    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { certification_id: certificationId },
      }),
    );
  }
}
