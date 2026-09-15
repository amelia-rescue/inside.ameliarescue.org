import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { type } from "arktype";
import { instrumentAwsSdkClient } from "../aws-xray.server";
import { DYNALITE_ENDPOINT } from "../dynalite-endpont";

export const truckCheckSchema = type({
  id: "string",
  created_by: "string",
  truck: "string",
  data: "Record<string, unknown>",
  contributors: {
    "[string]": {
      first_name: "string",
      last_name: "string",
    },
  },
  locked: "boolean",
  "schema_id?": "string",
  "schema_created_at?": "string",
});
truckCheckSchema.onUndeclaredKey("delete");

export type TruckCheck = typeof truckCheckSchema.infer;

export interface DocumentTruckCheck extends TruckCheck {
  revision?: number;
  mutation_streams?: Record<string, number>;
  created_at: string;
  updated_at: string;
  list_pk: string;
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

export class TruckCheckLocked extends Error {
  constructor() {
    super("This truck check is locked");
  }
}

export class TruckCheckCapacityExceeded extends Error {
  constructor() {
    super(
      "This check has reached its storage limit. Your edit has not been saved.",
    );
  }
}

export class TruckCheckLockNotPermitted extends Error {
  constructor(id: string) {
    super(`Truck check cannot be locked: ${id}`);
  }
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function isInvalidDocumentPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ValidationException" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("document path")
  );
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
      TruckCheckStore.client = instrumentAwsSdkClient(
        DynamoDBDocumentClient.from(dynamoDbClient),
      );
    }
    return new TruckCheckStore();
  }

  public async getTruckCheck(id: string): Promise<DocumentTruckCheck> {
    const command = new GetCommand({
      TableName: this.tableName,
      ConsistentRead: true,
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
      revision: 0,
      mutation_streams: {},
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      list_pk: "TRUCK_CHECK",
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTruckCheck,
      ConditionExpression: "attribute_not_exists(id)",
    });
    await TruckCheckStore.client.send(command);
    return documentTruckCheck;
  }

  public async applyFieldMutation(params: {
    id: string;
    fieldId: string;
    value: unknown;
    userId: string;
    clientId: string;
    sequence: number;
    legacy?: boolean;
    contributor: { first_name: string; last_name: string };
  }): Promise<{
    check: DocumentTruckCheck;
    previous: DocumentTruckCheck;
    duplicate: boolean;
  }> {
    const stream = JSON.stringify([params.userId, params.clientId]);
    for (let attempt = 0; attempt < 12; attempt++) {
      const previous = await this.getTruckCheck(params.id);
      if (
        !params.legacy &&
        (previous.mutation_streams?.[stream] ?? 0) >= params.sequence
      ) {
        return { check: previous, previous, duplicate: true };
      }
      if (previous.locked) throw new TruckCheckLocked();
      const streams = {
        ...previous.mutation_streams,
        ...(params.legacy ? {} : { [stream]: params.sequence }),
      };
      const contributors = {
        ...previous.contributors,
        [params.userId]: params.contributor,
      };
      const revision = previous.revision ?? 0;
      if (
        Object.keys(streams).length > 1000 ||
        Buffer.byteLength(
          JSON.stringify({
            ...previous,
            data: { ...previous.data, [params.fieldId]: params.value },
            contributors,
            mutation_streams: streams,
          }),
        ) > 300_000
      ) {
        throw new TruckCheckCapacityExceeded();
      }
      try {
        const result = await TruckCheckStore.client.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { id: params.id },
            ConditionExpression: `attribute_exists(id) AND locked = :false AND ${previous.revision === undefined ? "attribute_not_exists(revision)" : "revision = :previousRevision"}`,
            UpdateExpression:
              "SET #data.#field = :value, contributors = :contributors, mutation_streams = :streams, revision = :revision, updated_at = :now, list_pk = if_not_exists(list_pk, :list)",
            ExpressionAttributeNames: {
              "#data": "data",
              "#field": params.fieldId,
            },
            ExpressionAttributeValues: {
              ":false": false,
              ":value": params.value,
              ":contributors": contributors,
              ":streams": streams,
              ":revision": revision + 1,
              ":now": new Date().toISOString(),
              ":list": "TRUCK_CHECK",
              ...(previous.revision === undefined
                ? {}
                : { ":previousRevision": revision }),
            },
            ReturnValues: "ALL_NEW",
          }),
        );
        return {
          check: result.Attributes as DocumentTruckCheck,
          previous,
          duplicate: false,
        };
      } catch (error) {
        if (!isConditionalCheckFailed(error)) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * Math.min(100, 5 * 2 ** attempt)),
        );
      }
    }
    throw new Error("Check is busy; retry this mutation");
  }

  public async updateTruckCheckField({
    id,
    fieldId,
    value,
  }: {
    id: string;
    fieldId: string;
    value: unknown;
  }): Promise<DocumentTruckCheck> {
    try {
      const response = await TruckCheckStore.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          ConditionExpression: "attribute_exists(id) AND locked = :unlocked",
          UpdateExpression:
            "SET list_pk = if_not_exists(list_pk, :list_pk), #data.#fieldId = :value, updated_at = :updatedAt ADD revision :one",
          ExpressionAttributeNames: {
            "#data": "data",
            "#fieldId": fieldId,
          },
          ExpressionAttributeValues: {
            ":value": value,
            ":unlocked": false,
            ":one": 1,
            ":updatedAt": new Date().toISOString(),
            ":list_pk": "TRUCK_CHECK",
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      return response.Attributes as DocumentTruckCheck;
    } catch (error: unknown) {
      if (isConditionalCheckFailed(error)) {
        await this.getTruckCheck(id);
        throw new TruckCheckLocked();
      }

      throw error;
    }
  }

  /**
   * Locks a check so it becomes view-only. Conditional so a concurrent field
   * update can never race the lock away, and so only the creator can lock.
   */
  public async lockTruckCheck({
    id,
    userId,
  }: {
    id: string;
    userId: string;
  }): Promise<DocumentTruckCheck> {
    try {
      const response = await TruckCheckStore.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          ConditionExpression:
            "attribute_exists(id) AND created_by = :userId AND locked = :unlocked",
          UpdateExpression:
            "SET locked = :locked, updated_at = :updatedAt ADD revision :one",
          ExpressionAttributeValues: {
            ":userId": userId,
            ":one": 1,
            ":unlocked": false,
            ":locked": true,
            ":updatedAt": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      return response.Attributes as DocumentTruckCheck;
    } catch (error: unknown) {
      if (isConditionalCheckFailed(error)) {
        // Distinguish a missing check from a check the user may not lock
        await this.getTruckCheck(id);
        throw new TruckCheckLockNotPermitted(id);
      }

      throw error;
    }
  }

  /**
   * Adds a single contributor without rewriting the whole item, so it cannot
   * clobber concurrent changes to other attributes such as `locked`.
   */
  public async addContributor({
    id,
    userId,
    contributor,
  }: {
    id: string;
    userId: string;
    contributor: { first_name: string; last_name: string };
  }): Promise<DocumentTruckCheck> {
    try {
      const response = await TruckCheckStore.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          ConditionExpression: "attribute_exists(id)",
          UpdateExpression:
            "SET list_pk = if_not_exists(list_pk, :list_pk), contributors.#userId = :contributor, updated_at = :updatedAt ADD revision :one",
          ExpressionAttributeNames: {
            "#userId": userId,
          },
          ExpressionAttributeValues: {
            ":contributor": contributor,
            ":one": 1,
            ":list_pk": "TRUCK_CHECK",
            ":updatedAt": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      return response.Attributes as DocumentTruckCheck;
    } catch (error: unknown) {
      if (isConditionalCheckFailed(error)) {
        throw new TruckCheckNotFound(id);
      }

      // Checks written before contributors existed have no map to update into
      if (isInvalidDocumentPath(error)) {
        const response = await TruckCheckStore.client.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { id },
            ConditionExpression:
              "attribute_exists(id) AND attribute_not_exists(contributors)",
            UpdateExpression:
              "SET list_pk = if_not_exists(list_pk, :list_pk), contributors = :contributors, updated_at = :updatedAt ADD revision :one",
            ExpressionAttributeValues: {
              ":contributors": { [userId]: contributor },
              ":one": 1,
              ":list_pk": "TRUCK_CHECK",
              ":updatedAt": new Date().toISOString(),
            },
            ReturnValues: "ALL_NEW",
          }),
        );

        return response.Attributes as DocumentTruckCheck;
      }

      throw error;
    }
  }

  public async updateTruckCheck(
    truckCheck: Partial<TruckCheck> & { id: string },
  ): Promise<DocumentTruckCheck> {
    const existing = await this.getTruckCheck(truckCheck.id);

    const documentTruckCheck: DocumentTruckCheck = {
      ...existing,
      ...truckCheck,
      // merge the contributors on updates
      contributors: {
        ...existing.contributors,
        ...(truckCheck.contributors ?? {}),
      },
      revision: (existing.revision ?? 0) + 1,
      mutation_streams: existing.mutation_streams ?? {},
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
      list_pk: existing.list_pk ?? "TRUCK_CHECK",
    };

    const command = new PutCommand({
      TableName: this.tableName,
      Item: documentTruckCheck,
      ConditionExpression: `attribute_exists(id) AND ${existing.revision === undefined ? "attribute_not_exists(revision)" : "revision = :revision"}`,
      ...(existing.revision === undefined
        ? {}
        : { ExpressionAttributeValues: { ":revision": existing.revision } }),
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
      ConditionExpression: "attribute_exists(id) AND locked = :unlocked",
      ExpressionAttributeValues: { ":unlocked": false },
    });
    await TruckCheckStore.client.send(command);
  }

  public async listTruckChecks(
    lastEvaluatedKey?: Record<string, unknown>,
  ): Promise<{
    lastEvaluatedKey?: Record<string, unknown>;
    truckChecks: DocumentTruckCheck[];
  }> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: "CreatedAtIndex",
      KeyConditionExpression: "list_pk = :pk",
      ExpressionAttributeValues: {
        ":pk": "TRUCK_CHECK",
      },
      ScanIndexForward: false,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100,
    });
    const response = await TruckCheckStore.client.send(command);
    return {
      lastEvaluatedKey: response.LastEvaluatedKey,
      truckChecks: (response.Items || []) as unknown as DocumentTruckCheck[],
    };
  }

  public async listTruckChecksInRange(params: {
    startDate?: string;
    endDate?: string;
    lastEvaluatedKey?: Record<string, unknown>;
  }): Promise<{
    lastEvaluatedKey?: Record<string, unknown>;
    truckChecks: DocumentTruckCheck[];
  }> {
    const { startDate, endDate, lastEvaluatedKey } = params;
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": "TRUCK_CHECK",
    };

    let keyCondition = "list_pk = :pk";
    if (startDate && endDate) {
      keyCondition += " AND created_at BETWEEN :startDate AND :endDate";
      expressionAttributeValues[":startDate"] = startDate;
      expressionAttributeValues[":endDate"] = endDate;
    } else if (startDate) {
      keyCondition += " AND created_at >= :startDate";
      expressionAttributeValues[":startDate"] = startDate;
    } else if (endDate) {
      keyCondition += " AND created_at <= :endDate";
      expressionAttributeValues[":endDate"] = endDate;
    }

    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: "CreatedAtIndex",
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100,
    });
    const response = await TruckCheckStore.client.send(command);
    return {
      lastEvaluatedKey: response.LastEvaluatedKey,
      truckChecks: (response.Items || []) as unknown as DocumentTruckCheck[],
    };
  }
}
