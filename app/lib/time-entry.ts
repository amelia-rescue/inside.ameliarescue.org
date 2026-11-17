// Client-safe time tracking types and helpers. The DynamoDB store lives in
// time-entry-store.ts, which imports server-only modules.

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

export const LIST_PK = "TIME_ENTRIES";
export const MAX_NOTES_LENGTH = 500;

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
