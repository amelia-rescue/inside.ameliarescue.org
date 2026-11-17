import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  cancelOpenEntry: vi.fn(),
};

vi.mock("~/lib/time-entry-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/time-entry-store")>()),
  TimeEntryStore: { make: () => store },
}));

const { AlreadyClockedIn } = await import("~/lib/time-entry-store");
const { action } = await import("./time-tracking");

function contextFor(website_role: "user" | "admin" | "root") {
  return {
    get: () => ({ user: { user_id: "me", website_role }, timeZone: "UTC" }),
  } as any;
}

function run(role: "user" | "admin" | "root", fields: Record<string, string>) {
  return action({
    context: contextFor(role),
    params: {},
    request: new Request("http://localhost/admin/time-tracking", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  } as any);
}

async function statusOf(result: Promise<unknown>) {
  try {
    const value: any = await result;
    return value?.init?.status ?? 200;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

describe("time tracking action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is admin-only while it is a prototype", async () => {
    expect(
      await statusOf(run("user", { intent: "clock_in", entry_type: "duty" })),
    ).toBe(403);
    expect(store.clockIn).not.toHaveBeenCalled();
  });

  it("clocks in the caller with their location", async () => {
    expect(
      await statusOf(
        run("root", {
          intent: "clock_in",
          entry_type: "duty",
          unit: "ambulance-69",
          location_status: "ok",
          latitude: "37.3",
          longitude: "-77.9",
          accuracy_m: "30",
        }),
      ),
    ).toBe(200);
    expect(store.clockIn).toHaveBeenCalledWith({
      userId: "me",
      entryType: "duty",
      unit: "ambulance-69",
      location: {
        status: "ok",
        latitude: 37.3,
        longitude: -77.9,
        accuracy_m: 30,
      },
    });
  });

  it("rejects an unknown entry type", async () => {
    expect(
      await statusOf(run("admin", { intent: "clock_in", entry_type: "nap" })),
    ).toBe(400);
  });

  it("requires a whole number of calls at clock-out", async () => {
    for (const calls_run of ["", "-1", "1.5", "abc"]) {
      expect(
        await statusOf(
          run("admin", { intent: "clock_out", entry_type: "duty", calls_run }),
        ),
      ).toBe(400);
    }
    expect(store.clockOut).not.toHaveBeenCalled();
  });

  it("clocks out with self-reported calls and type", async () => {
    await run("admin", {
      intent: "clock_out",
      entry_type: "second_call",
      calls_run: "2",
      notes: "two calls",
      location_status: "denied",
    });
    expect(store.clockOut).toHaveBeenCalledWith({
      userId: "me",
      entryType: "second_call",
      callsRun: 2,
      notes: "two calls",
      location: { status: "denied" },
    });
  });

  it("turns store conflicts into a 409 with a message", async () => {
    store.clockIn.mockRejectedValueOnce(new AlreadyClockedIn());
    const result: any = await run("admin", {
      intent: "clock_in",
      entry_type: "duty",
    });
    expect(result.init.status).toBe(409);
    expect(result.data.error).toMatch(/already clocked in/i);
  });
});
