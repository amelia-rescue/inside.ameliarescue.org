import { beforeEach, expect, it, vi } from "vitest";
const { send, notify } = vi.hoisted(() => ({ send: vi.fn(), notify: vi.fn() }));
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  DynamoDBDocumentClient: { from: () => ({ send }) },
}));
vi.mock("~/lib/truck-check/issue-notifications", () => ({
  notifyTruckCheckIssues: notify,
}));
import { handler } from "./truck-check-lock";
beforeEach(() => {
  send.mockReset();
  notify.mockReset();
  vi.stubEnv("TRUCK_CHECKS_TABLE_NAME", "checks");
});
it("locks conditionally and notifies using the committed data", async () => {
  const old = { id: "check", created_at: "2020-01-01", data: { oxygen: true } };
  const committed = {
    ...old,
    revision: 5,
    locked: true,
    data: { oxygen: "not-present" },
  };
  send
    .mockResolvedValueOnce({ Items: [old] })
    .mockResolvedValueOnce({ Attributes: committed });
  await handler({} as any, {} as any, () => {});
  expect(send.mock.calls[1][0].input.ConditionExpression).toContain(
    "attribute_exists(id)",
  );
  expect(send.mock.calls[1][0].input.UpdateExpression).toContain("revision");
  expect(notify).toHaveBeenCalledWith({ checks: [committed] });
});
it("does not notify or recreate an already locked/deleted check", async () => {
  send
    .mockResolvedValueOnce({
      Items: [{ id: "check", created_at: "2020-01-01" }],
    })
    .mockRejectedValueOnce(
      Object.assign(new Error(), { name: "ConditionalCheckFailedException" }),
    );
  await handler({} as any, {} as any, () => {});
  expect(notify).not.toHaveBeenCalled();
});
it("scans beyond an empty filtered page", async () => {
  const check = {
    id: "check",
    created_at: "2020-01-01",
    locked: true,
    revision: 1,
  };
  send
    .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { id: "previous" } })
    .mockResolvedValueOnce({ Items: [check] })
    .mockResolvedValueOnce({ Attributes: check });
  await handler({} as any, {} as any, () => {});
  expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
    id: "previous",
  });
  expect(notify).toHaveBeenCalledWith({ checks: [check] });
});
