import { beforeEach, expect, it, vi } from "vitest";
const { send, post, apply } = vi.hoisted(() => ({
  send: vi.fn(),
  post: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  DynamoDBDocumentClient: { from: () => ({ send }) },
}));
vi.mock("~/lib/truck-check/realtime.server", () => ({
  sendToConnection: post,
  broadcastToTruckCheck: vi.fn(),
  getConnectedUsersForTruckCheck: async () => [],
}));
vi.mock("~/lib/auth.server", () => ({ getUserInfo: vi.fn() }));
vi.mock("~/lib/user-store", () => ({
  UserStore: {
    make: () => ({
      getUser: async () => ({ first_name: "A", last_name: "Test" }),
    }),
  },
}));
vi.mock("~/lib/truck-check/mutations.server", () => ({
  applyCheckMutation: apply,
}));
import { handler } from "./websocket";
const event = (body: any) =>
  ({
    requestContext: {
      eventType: "MESSAGE",
      connectionId: "c",
      domainName: "example.test",
      stage: "prod",
    },
    body: JSON.stringify(body),
  }) as any;
beforeEach(() => {
  send.mockReset();
  post.mockReset();
  apply.mockReset();
  vi.stubEnv("WEBSOCKET_CONNECTIONS_TABLE_NAME", "connections");
  send.mockResolvedValue({
    Item: {
      user_id: "a",
      truckCheckId: "check",
      ttl: Date.now() / 1000 + 3600,
    },
  });
});
it("answers heartbeats explicitly", async () => {
  expect((await handler(event({ action: "ping" }))).statusCode).toBe(200);
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ message: { type: "pong" } }),
  );
});
it("rejects edits for a check the socket has not joined", async () => {
  expect(
    (
      await handler(
        event({
          action: "update-field",
          truckCheckId: "other",
          fieldId: "oxygen",
          value: true,
        }),
      )
    ).statusCode,
  ).toBe(400);
  expect(apply).not.toHaveBeenCalled();
});
it("routes legacy edits through atomic persistence without growing dedupe metadata", async () => {
  apply.mockResolvedValue({ snapshot: { revision: 1 }, acknowledged: {} });
  expect(
    (
      await handler(
        event({
          action: "update-field",
          truckCheckId: "check",
          fieldId: "oxygen",
          value: true,
        }),
      )
    ).statusCode,
  ).toBe(200);
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ legacy: true, userId: "a", id: "check" }),
  );
});
