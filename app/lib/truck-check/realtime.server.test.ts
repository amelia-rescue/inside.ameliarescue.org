import { beforeEach, expect, it, vi } from "vitest";
const { send, post } = vi.hoisted(() => ({ send: vi.fn(), post: vi.fn() }));
vi.mock("@aws-sdk/lib-dynamodb", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, DynamoDBDocumentClient: { from: () => ({ send }) } };
});
import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import { broadcastToTruckCheck } from "./realtime.server";
beforeEach(() => {
  send.mockReset();
  post.mockReset();
});
it("paginates recipients and cleans SDK v3 Gone errors", async () => {
  send
    .mockResolvedValueOnce({
      Items: [{ connectionId: "a" }],
      LastEvaluatedKey: { connectionId: "a" },
    })
    .mockResolvedValueOnce({ Items: [{ connectionId: "b" }] })
    .mockResolvedValue({});
  post
    .mockRejectedValueOnce({
      name: "GoneException",
      $metadata: { httpStatusCode: 410 },
    })
    .mockResolvedValue({});
  await broadcastToTruckCheck({
    apiGatewayClient: {
      send: post,
    } as unknown as ApiGatewayManagementApiClient,
    connectionsTableName: "connections",
    truckCheckId: "check",
    message: { type: "field-update" },
  });
  expect(post).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
    connectionId: "a",
  });
  expect(send.mock.calls[2][0].input.Key).toEqual({ connectionId: "a" });
});
