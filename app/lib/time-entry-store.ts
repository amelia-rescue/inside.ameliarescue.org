import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { instrumentAwsSdkClient } from "./aws-xray.server";
import { DYNALITE_ENDPOINT } from "./dynalite-endpont";
import {
  LIST_PK,
  MAX_NOTES_LENGTH,
  AlreadyClockedIn,
  NotClockedIn,
  TimeEntryError,
  hoursBetween,
  type TimeEntry,
  type TimeEntryLocation,
  type TimeEntryType,
} from "./time-entry";

export * from "./time-entry";

export class TimeEntryStore {
  private static client: DynamoDBDocumentClient;
  private readonly tableName = "aes_time_entries";

  private constructor() {}

  public static make() {
    if (!TimeEntryStore.client) {
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
      TimeEntryStore.client = instrumentAwsSdkClient(
        DynamoDBDocumentClient.from(dynamoDbClient, {
          marshallOptions: {
            removeUndefinedValues: true,
          },
        }),
      );
    }

    return new TimeEntryStore();
  }

  /** A member's most recent entries, newest first. */
  public async listForUser(userId: string, limit = 20): Promise<TimeEntry[]> {
    const response = await TimeEntryStore.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "user_id = :u",
        ExpressionAttributeValues: { ":u": userId },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (response.Items ?? []) as TimeEntry[];
  }

  /**
   * The member's open entry, if any. Only the newest entry can be open
   * because clocking in is refused while one is.
   */
  public async getOpenEntry(userId: string): Promise<TimeEntry | null> {
    const [latest] = await this.listForUser(userId, 1);
    return latest?.status === "open" ? latest : null;
  }

  /** Everyone's entries with clock-in in [fromIso, toIso), oldest first. */
  public async listBetween(
    fromIso: string,
    toIso: string,
  ): Promise<TimeEntry[]> {
    const entries: TimeEntry[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await TimeEntryStore.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "ClockInIndex",
          KeyConditionExpression:
            "list_pk = :pk AND clock_in_at BETWEEN :from AND :to",
          ExpressionAttributeValues: {
            ":pk": LIST_PK,
            ":from": fromIso,
            ":to": toIso,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of (response.Items ?? []) as TimeEntry[]) {
        // BETWEEN is inclusive; the range is meant to be half-open.
        if (item.clock_in_at < toIso) entries.push(item);
      }
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return entries;
  }

  public async clockIn(params: {
    userId: string;
    entryType: TimeEntryType;
    unit?: string;
    location: TimeEntryLocation;
    now?: Date;
  }): Promise<TimeEntry> {
    if (await this.getOpenEntry(params.userId)) {
      throw new AlreadyClockedIn();
    }
    const nowIso = (params.now ?? new Date()).toISOString();
    const entry: TimeEntry = {
      user_id: params.userId,
      entry_id: `${nowIso}#${crypto.randomUUID().slice(0, 8)}`,
      list_pk: LIST_PK,
      status: "open",
      entry_type: params.entryType,
      unit: params.unit?.trim() || undefined,
      clock_in_at: nowIso,
      clock_in_location: params.location,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await TimeEntryStore.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: entry,
        ConditionExpression: "attribute_not_exists(entry_id)",
      }),
    );
    return entry;
  }

  public async clockOut(params: {
    userId: string;
    entryType: TimeEntryType;
    callsRun: number;
    notes?: string;
    location: TimeEntryLocation;
    now?: Date;
  }): Promise<TimeEntry> {
    const open = await this.getOpenEntry(params.userId);
    if (!open) {
      throw new NotClockedIn();
    }
    if (!Number.isInteger(params.callsRun) || params.callsRun < 0) {
      throw new TimeEntryError("Calls run must be a whole number, 0 or more.");
    }
    const nowIso = (params.now ?? new Date()).toISOString();
    const notes = params.notes?.trim().slice(0, MAX_NOTES_LENGTH) || undefined;
    const response = await TimeEntryStore.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { user_id: open.user_id, entry_id: open.entry_id },
        UpdateExpression:
          "SET #status = :closed, entry_type = :type, clock_out_at = :out, clock_out_location = :loc, total_hours = :hours, calls_run = :calls, updated_at = :out" +
          (notes ? ", notes = :notes" : " REMOVE notes"),
        ConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":closed": "closed",
          ":open": "open",
          ":type": params.entryType,
          ":out": nowIso,
          ":loc": params.location,
          ":hours": hoursBetween(open.clock_in_at, nowIso),
          ":calls": params.callsRun,
          ...(notes ? { ":notes": notes } : {}),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return response.Attributes as TimeEntry;
  }

  /** Throws away an open entry started by mistake. Closed entries are kept. */
  public async cancelOpenEntry(userId: string): Promise<void> {
    const open = await this.getOpenEntry(userId);
    if (!open) {
      throw new NotClockedIn();
    }
    await TimeEntryStore.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { user_id: open.user_id, entry_id: open.entry_id },
        ConditionExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":open": "open" },
      }),
    );
  }
}
