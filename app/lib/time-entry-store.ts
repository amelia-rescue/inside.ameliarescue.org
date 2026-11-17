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

/**
 * What a block of time was for. Mirrors the "Remarks" column of the paper
 * duty hours log.
 */
export const TIME_ENTRY_TYPES = [
  "duty",
  "second_call",
  "training",
  "meeting",
] as const;
export type TimeEntryType = (typeof TIME_ENTRY_TYPES)[number];

export const TIME_ENTRY_TYPE_LABELS: Record<TimeEntryType, string> = {
  duty: "Duty",
  second_call: "2nd call (from home)",
  training: "Training",
  meeting: "Meeting",
};

export function isTimeEntryType(value: unknown): value is TimeEntryType {
  return (
    typeof value === "string" &&
    (TIME_ENTRY_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Where the member was when they pressed the button, as reported by the
 * browser. `status` records why there are no coordinates when there are none.
 */
export type LocationStatus = "ok" | "denied" | "unavailable" | "timeout";

export interface TimeEntryLocation {
  status: LocationStatus;
  latitude?: number;
  longitude?: number;
  /** Radius in meters the browser is ~68% confident the device is within. */
  accuracy_m?: number;
}

export interface TimeEntry {
  user_id: string;
  /** `<clock_in_at>#<random>`: sorts a member's entries by clock-in time. */
  entry_id: string;
  list_pk: typeof LIST_PK;
  status: "open" | "closed";
  entry_type: TimeEntryType;
  /** Truck id from the truck check store, when the time was on a truck. */
  unit?: string;
  clock_in_at: string;
  clock_in_location: TimeEntryLocation;
  clock_out_at?: string;
  clock_out_location?: TimeEntryLocation;
  /** Wall-clock hours between clock in and out, to two decimal places. */
  total_hours?: number;
  calls_run?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const LIST_PK = "TIME_ENTRIES";
const MAX_NOTES_LENGTH = 500;

export class TimeEntryError extends Error {}

export class AlreadyClockedIn extends TimeEntryError {
  constructor() {
    super("You're already clocked in. Clock out first.");
  }
}

export class NotClockedIn extends TimeEntryError {
  constructor() {
    super("You aren't clocked in.");
  }
}

export function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100);
}

/**
 * Validates browser-reported location. Anything malformed is stored as
 * "unavailable" rather than rejected: a bad GPS read must never stop someone
 * from clocking in.
 */
export function normalizeLocation(input: {
  status?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  accuracy_m?: unknown;
}): TimeEntryLocation {
  const status = input.status;
  if (status === "denied" || status === "timeout") {
    return { status };
  }
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracy = Number(input.accuracy_m);
  if (
    status !== "ok" ||
    input.latitude === "" ||
    input.longitude === "" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { status: "unavailable" };
  }
  return {
    status: "ok",
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    ...(Number.isFinite(accuracy) && accuracy >= 0
      ? { accuracy_m: Math.round(accuracy) }
      : {}),
  };
}

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
