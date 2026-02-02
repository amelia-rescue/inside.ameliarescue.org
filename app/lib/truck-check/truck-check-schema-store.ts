export interface Truck {
  truckId: string;
  displayName: string; // "Medic 1"
  schemaId: string; // active schema for this truck
}

export interface TruckCheckSchema {
  schemaId: string;
  version: number;
  title: string;
  sections: SchemaSection[];
  createdAt: string;
}

export interface SchemaSection {
  id: string; // stable ID
  title: string;
  description?: string;
  fields: SchemaField[];
}

interface BaseField {
  label: string;
  required?: boolean;
  helpText?: string;
}

export type SchemaField =
  | CheckboxField
  | TextField
  | NumberField
  | SelectField
  | PhotoField;

export interface CheckboxField extends BaseField {
  type: "checkbox";
  defaultValue?: boolean;
}

export interface TextField extends BaseField {
  type: "text";
  placeholder?: string;
  maxLength?: number;
}

export interface NumberField extends BaseField {
  type: "number";
  min?: number;
  max?: number;
  unit?: string; // "psi", "miles", "volts"
}

export interface SelectField extends BaseField {
  type: "select";
  options: {
    value: string;
    label: string;
  }[];
}

export interface PhotoField extends BaseField {
  type: "photo";
  maxPhotos?: number;
}

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DYNALITE_ENDPOINT } from "../dynalite-endpont";

export class TruckNotFound extends Error {
  constructor(truckId: string) {
    super(`Truck not found: ${truckId}`);
  }
}

export class SchemaNotFound extends Error {
  constructor(schemaId: string) {
    super(`Schema not found: ${schemaId}`);
  }
}

interface DynamoTruck extends Truck {
  document_key: string;
  range_key: string;
}

interface DynamoSchema extends TruckCheckSchema {
  document_key: string;
  range_key: string;
}

export class TruckCheckSchemaStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_truck_check_schemas";
  private readonly TRUCK_PREFIX = "truck";
  private readonly SCHEMA_PREFIX = "truck_schema";

  private constructor() {}

  public static make() {
    if (!TruckCheckSchemaStore.client) {
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
      TruckCheckSchemaStore.client =
        DynamoDBDocumentClient.from(dynamoDbClient);
    }
    return new TruckCheckSchemaStore();
  }

  // Truck operations
  public async getTruck(truckId: string): Promise<Truck> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        document_key: this.TRUCK_PREFIX,
        range_key: truckId,
      },
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    if (!response.Item) {
      throw new TruckNotFound(truckId);
    }
    const { document_key, range_key, ...truck } = response.Item as DynamoTruck;
    return truck as Truck;
  }

  public async createTruck(truck: Truck): Promise<Truck> {
    const item: DynamoTruck = {
      ...truck,
      document_key: this.TRUCK_PREFIX,
      range_key: truck.truckId,
    };
    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await TruckCheckSchemaStore.client.send(command);
    return truck;
  }

  public async updateTruck(truck: Truck): Promise<Truck> {
    await this.getTruck(truck.truckId);
    const item: DynamoTruck = {
      ...truck,
      document_key: this.TRUCK_PREFIX,
      range_key: truck.truckId,
    };
    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await TruckCheckSchemaStore.client.send(command);
    return truck;
  }

  public async deleteTruck(truckId: string): Promise<void> {
    await this.getTruck(truckId);
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        document_key: this.TRUCK_PREFIX,
        range_key: truckId,
      },
    });
    await TruckCheckSchemaStore.client.send(command);
  }

  public async listTrucks(): Promise<Truck[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "document_key = :pk",
      ExpressionAttributeValues: {
        ":pk": this.TRUCK_PREFIX,
      },
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    return (response.Items || []).map((item) => {
      const { document_key, range_key, ...truck } = item as DynamoTruck;
      return truck as Truck;
    });
  }

  // Schema operations
  public async getSchema(schemaId: string): Promise<TruckCheckSchema> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression:
        "document_key = :pk AND begins_with(range_key, :schema_id)",
      ExpressionAttributeValues: {
        ":pk": this.SCHEMA_PREFIX,
        ":schema_id": `${schemaId}:`,
      },
      ScanIndexForward: false,
      Limit: 1,
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    if (!response.Items || response.Items.length === 0) {
      throw new SchemaNotFound(schemaId);
    }
    const { document_key, range_key, ...schema } = response
      .Items[0] as DynamoSchema;
    return schema as TruckCheckSchema;
  }

  public async createSchema(
    schema: Omit<TruckCheckSchema, "schemaId" | "createdAt">,
  ): Promise<TruckCheckSchema> {
    const schemaId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const fullSchema: TruckCheckSchema = {
      ...schema,
      schemaId,
      createdAt,
    };

    const item: DynamoSchema = {
      ...fullSchema,
      document_key: this.SCHEMA_PREFIX,
      range_key: `${schemaId}:${createdAt}`,
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await TruckCheckSchemaStore.client.send(command);
    return fullSchema;
  }

  public async updateSchema(
    schema: Omit<TruckCheckSchema, "createdAt">,
  ): Promise<TruckCheckSchema> {
    await this.getSchema(schema.schemaId);
    const createdAt = new Date().toISOString();
    const updatedSchema: TruckCheckSchema = {
      ...schema,
      createdAt,
    };
    const item: DynamoSchema = {
      ...updatedSchema,
      document_key: this.SCHEMA_PREFIX,
      range_key: `${schema.schemaId}:${createdAt}`,
    };
    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await TruckCheckSchemaStore.client.send(command);
    return updatedSchema;
  }

  public async deleteSchema(schemaId: string): Promise<void> {
    const schema = await this.getSchema(schemaId);
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: {
        document_key: this.SCHEMA_PREFIX,
        range_key: `${schemaId}:${schema.createdAt}`,
      },
    });
    await TruckCheckSchemaStore.client.send(command);
  }

  public async getSchemaVersion(
    schemaId: string,
    createdAt: string,
  ): Promise<TruckCheckSchema> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        document_key: this.SCHEMA_PREFIX,
        range_key: `${schemaId}:${createdAt}`,
      },
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    if (!response.Item) {
      throw new SchemaNotFound(`${schemaId} at ${createdAt}`);
    }
    const { document_key, range_key, ...schema } =
      response.Item as DynamoSchema;
    return schema as TruckCheckSchema;
  }

  public async listSchemaVersions(
    schemaId: string,
  ): Promise<TruckCheckSchema[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression:
        "document_key = :pk AND begins_with(range_key, :schema_id)",
      ExpressionAttributeValues: {
        ":pk": this.SCHEMA_PREFIX,
        ":schema_id": `${schemaId}:`,
      },
      ScanIndexForward: false,
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    return (response.Items || []).map((item) => {
      const { document_key, range_key, ...schema } = item as DynamoSchema;
      return schema as TruckCheckSchema;
    });
  }

  public async listSchemas(): Promise<TruckCheckSchema[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "document_key = :pk",
      ExpressionAttributeValues: {
        ":pk": this.SCHEMA_PREFIX,
      },
    });
    const response = await TruckCheckSchemaStore.client.send(command);
    return (response.Items || []).map((item) => {
      const { document_key, range_key, ...schema } = item as DynamoSchema;
      return schema as TruckCheckSchema;
    });
  }

  public async getLatestSchemaVersion(): Promise<TruckCheckSchema | null> {
    const schemas = await this.listSchemas();

    if (schemas.length === 0) {
      return null;
    }

    return schemas.sort((a, b) => b.version - a.version)[0];
  }
}
