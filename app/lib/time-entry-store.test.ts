import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  AlreadyClockedIn,
  NotClockedIn,
  TimeEntryStore,
  hoursBetween,
  normalizeLocation,
  type TimeEntry,
} from "./time-entry-store";
import { summarizeByMember } from "./time-entry-summary";

const here = { status: "ok" as const, latitude: 37.34, longitude: -77.98 };

describe("time entry store", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("clocks in, then out, computing hours and keeping both locations", async () => {
    const store = TimeEntryStore.make();
    const opened = await store.clockIn({
      userId: "u1",
      entryType: "duty",
      unit: "ambulance-69",
      location: here,
      now: new Date("2026-11-13T23:15:00.000Z"),
    });
    expect(opened.status).toBe("open");
    expect(await store.getOpenEntry("u1")).toMatchObject({
      entry_id: opened.entry_id,
    });

    const closed = await store.clockOut({
      userId: "u1",
      entryType: "duty",
      callsRun: 1,
      notes: "  quiet night  ",
      location: { status: "denied" },
      now: new Date("2026-11-14T05:00:00.000Z"),
    });
    expect(closed).toMatchObject({
      status: "closed",
      unit: "ambulance-69",
      total_hours: 5.75,
      calls_run: 1,
      notes: "quiet night",
      clock_in_location: here,
      clock_out_location: { status: "denied" },
    });
    expect(await store.getOpenEntry("u1")).toBeNull();
  });

  it("refuses a second clock-in while one is open", async () => {
    const store = TimeEntryStore.make();
    await store.clockIn({ userId: "u1", entryType: "duty", location: here });
    await expect(
      store.clockIn({ userId: "u1", entryType: "meeting", location: here }),
    ).rejects.toBeInstanceOf(AlreadyClockedIn);
  });

  it("refuses clock-out and cancel when not clocked in", async () => {
    const store = TimeEntryStore.make();
    await expect(
      store.clockOut({
        userId: "u1",
        entryType: "duty",
        callsRun: 0,
        location: here,
      }),
    ).rejects.toBeInstanceOf(NotClockedIn);
    await expect(store.cancelOpenEntry("u1")).rejects.toBeInstanceOf(
      NotClockedIn,
    );
  });

  it("lets the type change at clock-out (duty that turned into a 2nd call)", async () => {
    const store = TimeEntryStore.make();
    await store.clockIn({ userId: "u1", entryType: "duty", location: here });
    const closed = await store.clockOut({
      userId: "u1",
      entryType: "second_call",
      callsRun: 1,
      location: here,
    });
    expect(closed.entry_type).toBe("second_call");
  });

  it("cancel deletes only the open entry", async () => {
    const store = TimeEntryStore.make();
    const t0 = new Date("2026-11-01T18:00:00.000Z");
    await store.clockIn({
      userId: "u1",
      entryType: "duty",
      location: here,
      now: t0,
    });
    await store.clockOut({
      userId: "u1",
      entryType: "duty",
      callsRun: 0,
      location: here,
      now: new Date("2026-11-01T22:00:00.000Z"),
    });
    await store.clockIn({
      userId: "u1",
      entryType: "meeting",
      location: here,
      now: new Date("2026-11-02T18:00:00.000Z"),
    });
    await store.cancelOpenEntry("u1");
    const entries = await store.listForUser("u1");
    expect(entries).toHaveLength(1);
    expect(entries[0].entry_type).toBe("duty");
  });

  it("lists everyone's entries by clock-in time within a half-open range", async () => {
    const store = TimeEntryStore.make();
    const at = (iso: string, userId: string) =>
      store.clockIn({
        userId,
        entryType: "duty",
        location: here,
        now: new Date(iso),
      });
    await at("2026-10-31T23:00:00.000Z", "a");
    await at("2026-11-05T18:00:00.000Z", "b");
    await at("2026-11-20T18:00:00.000Z", "c");
    await at("2026-12-01T00:00:00.000Z", "d");

    const november = await store.listBetween(
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
    );
    expect(november.map((e) => e.user_id)).toEqual(["b", "c"]);
  });
});

describe("hoursBetween", () => {
  it("rounds to two decimals and never goes negative", () => {
    expect(hoursBetween("2026-01-01T18:00:00Z", "2026-01-02T00:00:00Z")).toBe(
      6,
    );
    expect(hoursBetween("2026-01-01T18:10:00Z", "2026-01-01T22:20:00Z")).toBe(
      4.17,
    );
    expect(hoursBetween("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(
      0,
    );
  });
});

describe("normalizeLocation", () => {
  it("keeps valid coordinates, rounded", () => {
    expect(
      normalizeLocation({
        status: "ok",
        latitude: "37.3456789",
        longitude: "-77.9812346",
        accuracy_m: "41.7",
      }),
    ).toEqual({
      status: "ok",
      latitude: 37.345679,
      longitude: -77.981235,
      accuracy_m: 42,
    });
  });

  it("records why there is no location", () => {
    expect(normalizeLocation({ status: "denied" })).toEqual({
      status: "denied",
    });
    expect(normalizeLocation({ status: "timeout" })).toEqual({
      status: "timeout",
    });
    expect(normalizeLocation({})).toEqual({ status: "unavailable" });
  });

  it("downgrades malformed coordinates to unavailable instead of failing", () => {
    expect(
      normalizeLocation({ status: "ok", latitude: "abc", longitude: "1" }),
    ).toEqual({ status: "unavailable" });
    expect(
      normalizeLocation({ status: "ok", latitude: "91", longitude: "1" }),
    ).toEqual({ status: "unavailable" });
    expect(
      normalizeLocation({ status: "ok", latitude: "", longitude: "" }),
    ).toEqual({ status: "unavailable" });
  });
});

describe("summarizeByMember", () => {
  const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
    user_id: "u1",
    entry_id: "x",
    list_pk: "TIME_ENTRIES",
    status: "closed",
    entry_type: "duty",
    clock_in_at: "2026-11-01T18:00:00.000Z",
    clock_in_location: { status: "unavailable" },
    total_hours: 6,
    calls_run: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  });

  it("totals hours by type and flags the 12.5 duty-hour target", () => {
    const [u1, u2] = summarizeByMember([
      entry({ total_hours: 6 }),
      entry({ total_hours: 6.5, calls_run: 2 }),
      entry({ entry_type: "meeting", total_hours: 1.5, calls_run: 0 }),
      entry({ user_id: "u2", total_hours: 4 }),
      entry({ user_id: "u2", status: "open", total_hours: undefined }),
    ]);
    expect(u1).toMatchObject({
      user_id: "u1",
      total_hours: 14,
      calls_run: 3,
      entry_count: 3,
      meets_duty_target: true,
    });
    expect(u1.hours_by_type).toEqual({
      duty: 12.5,
      second_call: 0,
      training: 0,
      meeting: 1.5,
    });
    expect(u2).toMatchObject({
      total_hours: 4,
      open_entries: 1,
      entry_count: 2,
      meets_duty_target: false,
    });
  });
});
