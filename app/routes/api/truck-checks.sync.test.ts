import { beforeEach, expect, it, vi } from "vitest";
import { action, loader } from "./truck-checks.sync";
import { applyCheckMutation } from "~/lib/truck-check/mutations.server";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
vi.mock("~/lib/truck-check/mutations.server", () => ({
  applyCheckMutation: vi.fn(),
  InvalidFieldMutation: class extends Error {},
  toSnapshot: (check: any, userId: string) => ({ ...check, userId }),
}));
vi.mock("~/lib/truck-check/truck-check-store", () => ({
  TruckCheckStore: { make: vi.fn() },
  TruckCheckNotFound: class extends Error {},
  TruckCheckLocked: class extends Error {},
  TruckCheckCapacityExceeded: class extends Error {},
}));
const user = {
  user_id: "a",
  first_name: "A",
  last_name: "Test",
  accessToken: "token",
};
const args = (request: Request, authenticated = true) =>
  ({
    request,
    params: { id: "check" },
    context: { get: () => (authenticated ? { user } : null) },
  }) as any;
function post(origin: string, body: string, userId = "a") {
  const request = new Request(
    "https://example.test/api/truck-checks/check/sync",
    { method: "POST", body },
  );
  Object.defineProperty(request, "headers", {
    value: new Headers({ Origin: origin, "X-Truck-Check-User": userId }),
  });
  return request;
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://example.test");
  vi.mocked(TruckCheckStore.make).mockReturnValue({
    getTruckCheck: async () => ({
      id: "check",
      data: {},
      revision: 1,
      locked: false,
      contributors: {},
    }),
  } as any);
  vi.mocked(applyCheckMutation).mockClear();
});
it("returns non-cacheable snapshots and only supplies tokens for bootstrap", async () => {
  const result = await loader(
    args(new Request("https://example.test/api/truck-checks/check/sync")),
  );
  expect(result.headers.get("Cache-Control")).toContain("no-store");
  expect(await result.json()).not.toHaveProperty("accessToken");
  const connect = await loader(
    args(
      new Request("https://example.test/api/truck-checks/check/sync?connect=1"),
    ),
  );
  expect((await connect.json()).accessToken).toBe("token");
});
it("requires authentication, same-origin POST, and a valid envelope", async () => {
  expect(
    (await loader(args(new Request("https://example.test"), false))).status,
  ).toBe(401);
  expect(
    (await action(args(post("https://elsewhere.test", "{}")))).status,
  ).toBe(403);
  expect(
    (await action(args(post("https://example.test", "invalid")))).status,
  ).toBe(400);
  expect((await action(args(post("https://example.test", "{}")))).status).toBe(
    400,
  );
  expect(applyCheckMutation).not.toHaveBeenCalled();
});
it("refuses to replay an outbox after the session changes user", async () => {
  expect(
    (await action(args(post("https://example.test", "{}", "b")))).status,
  ).toBe(401);
  expect(applyCheckMutation).not.toHaveBeenCalled();
});
it("passes only the authenticated identity to mutation handling", async () => {
  vi.mocked(applyCheckMutation).mockResolvedValue({
    acknowledged: { clientId: "client", sequence: 1 },
  } as any);
  const request = post(
    "https://example.test",
    JSON.stringify({
      clientId: "client",
      sequence: 1,
      fieldId: "oxygen",
      value: true,
      userId: "forged",
    }),
  );
  expect((await action(args(request))).status).toBe(200);
  expect(applyCheckMutation).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "a", id: "check" }),
  );
});
