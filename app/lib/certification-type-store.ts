import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";

export const certificationTypeSchema = type({
  name: "string",
  description: "string",
  expires: "boolean",
});

export type CertificationType = typeof certificationTypeSchema.infer;

interface DocumentCertificationType extends CertificationType {
  created_at: string;
  updated_at: string;
}

export class CertificationTypeNotFound extends Error {
  constructor(name: string) {
    super(`Certification type not found: ${name}`);
  }
}

export class CertificationTypeAlreadyExists extends Error {
  constructor(name: string) {
    super(`Certification type already exists: ${name}`);
  }
}

export class CertificationTypeStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_certification_types";

  private constructor() {}

  public static make() {
    if (!CertificationTypeStore.client) {
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
      CertificationTypeStore.client =
        DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new CertificationTypeStore();
  }

  public async getCertificationType(
    name: string,
  ): Promise<DocumentCertificationType> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        name,
      },
    });
    const response = await CertificationTypeStore.client.send(command);
    if (!response.Item) {
      throw new CertificationTypeNotFound(name);
    }
    return response.Item as unknown as DocumentCertificationType;
  }

  public async createCertificationType(
    certificationType: CertificationType,
  ): Promise<DocumentCertificationType> {
    try {
      await this.getCertificationType(certificationType.name);
      throw new CertificationTypeAlreadyExists(certificationType.name);
    } catch (error) {
      if (!(error instanceof CertificationTypeNotFound)) {
        throw error;
      }
    }

    const documentCertificationType: DocumentCertificationType = {
      ...certificationType,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentCertificationType,
      ConditionExpression: "attribute_not_exists(#name)",
      ExpressionAttributeNames: {
        "#name": "name",
      },
    });
    await CertificationTypeStore.client.send(command);
    return documentCertificationType;
  }

  public async updateCertificationType(
    certificationType: CertificationType,
  ): Promise<DocumentCertificationType> {
    const existing = await this.getCertificationType(certificationType.name);

    const documentCertificationType: DocumentCertificationType = {
      ...certificationType,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentCertificationType,
    });
    await CertificationTypeStore.client.send(command);
    return documentCertificationType;
  }

  public async listCertificationTypes(): Promise<DocumentCertificationType[]> {
    const command = new ScanCommand({
      TableName: this.tableName,
    });
    const response = await CertificationTypeStore.client.send(command);
    return (response.Items || []) as unknown as DocumentCertificationType[];
  }
}
