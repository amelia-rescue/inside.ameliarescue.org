import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { log } from "~/lib/logger";
import {
  TruckCheckStore,
  TruckCheckLocked,
} from "~/lib/truck-check/truck-check-store";
import type { ApiGatewayWebSocketEvent } from "types/apigateway";
import { getUserInfo } from "~/lib/auth.server";
import { UserStore } from "~/lib/user-store";
import { applyCheckMutation } from "~/lib/truck-check/mutations.server";
import { isFieldMutation } from "~/lib/truck-check/sync-protocol";
import {
  broadcastToTruckCheck,
  getConnectedUsersForTruckCheck,
  sendToConnection,
} from "~/lib/truck-check/realtime.server";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: ApiGatewayWebSocketEvent & { body?: string },
) => {
  const { connectionId, eventType, domainName, stage } = event.requestContext;
  const tableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
  const started = Date.now();
  if (!tableName) return { statusCode: 500, body: "Configuration error" };
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });
  const send = (message: Record<string, unknown>) =>
    sendToConnection({ apiGatewayClient, connectionId, message });
  const broadcast = (
    truckCheckId: string,
    message: Record<string, unknown>,
    excludeConnectionId?: string,
  ) =>
    broadcastToTruckCheck({
      apiGatewayClient,
      connectionsTableName: tableName,
      truckCheckId,
      message,
      excludeConnectionId,
    });
  try {
    if (eventType === "CONNECT") {
      const token = event.queryStringParameters?.access_token;
      if (!token) return { statusCode: 401, body: "Authentication required" };
      const info = await getUserInfo(token);
      const userId =
        typeof info["custom:user_id"] === "string"
          ? info["custom:user_id"]
          : info.sub;
      if (typeof userId !== "string")
        return { statusCode: 401, body: "Authentication required" };
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            connectionId,
            user_id: userId,
            connectedAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + 7200,
          },
        }),
      );
      return { statusCode: 200, body: "Connected" };
    }

    const { Item: connection } = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { connectionId },
        ConsistentRead: true,
      }),
    );
    if (eventType === "DISCONNECT") {
      await docClient.send(
        new DeleteCommand({ TableName: tableName, Key: { connectionId } }),
      );
      if (connection?.truckCheckId) {
        await broadcast(connection.truckCheckId, {
          type: "user-left",
          truckCheckId: connection.truckCheckId,
          userId: connection.user_id,
          connectedUsers: await getConnectedUsersForTruckCheck({
            connectionsTableName: tableName,
            truckCheckId: connection.truckCheckId,
          }),
        });
      }
      return { statusCode: 200, body: "Disconnected" };
    }
    if (!connection?.user_id || connection.ttl <= Date.now() / 1000) {
      await send({
        type: "sync-error",
        code: "unauthorized",
        error: "Reconnect to continue.",
      });
      return { statusCode: 401, body: "Connection not found" };
    }
    if (eventType !== "MESSAGE")
      return { statusCode: 400, body: "Unknown event" };
    const body = event.body ? JSON.parse(event.body) : {};
    if (body.action === "ping") {
      await send({ type: "pong" });
      return { statusCode: 200, body: "Pong" };
    }
    if (
      typeof body.truckCheckId !== "string" ||
      body.truckCheckId.length > 128
    ) {
      await send({
        type: "sync-error",
        code: "invalid",
        error: "Missing check ID.",
      });
      return { statusCode: 400, body: "Missing check ID" };
    }
    const truckCheckId = body.truckCheckId;
    const store = TruckCheckStore.make();
    if (body.action === "join-truck-check") {
      await store.getTruckCheck(truckCheckId);
      const user = await UserStore.make().getUser(connection.user_id);
      const userName = `${user.first_name} ${user.last_name}`.trim();
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { connectionId },
          ConditionExpression: "attribute_exists(connectionId)",
          UpdateExpression: "SET truckCheckId = :id, userName = :name",
          ExpressionAttributeValues: { ":id": truckCheckId, ":name": userName },
        }),
      );
      const check = await store.getTruckCheck(truckCheckId);
      const connectedUsers = await getConnectedUsersForTruckCheck({
        connectionsTableName: tableName,
        truckCheckId,
      });
      const contributors = Object.entries(check.contributors || {}).map(
        ([userId, name]) => ({
          userId,
          userName: `${name.first_name} ${name.last_name}`.trim(),
        }),
      );
      await send({
        type: "truck-check-joined",
        truckCheckId,
        revision: check.revision ?? 0,
        truckCheckData: check.data || {},
        locked: check.locked,
        connectedUsers,
        contributors,
      });
      await broadcast(
        truckCheckId,
        {
          type: "user-joined",
          truckCheckId,
          userId: connection.user_id,
          userName,
          connectedUsers,
          contributors,
        },
        connectionId,
      );
      return { statusCode: 200, body: "Joined truck check" };
    }
    if (
      body.action !== "update-field" ||
      connection.truckCheckId !== truckCheckId
    ) {
      await send({
        type: "sync-error",
        code: "invalid",
        error: "Join the check before editing.",
      });
      return { statusCode: 400, body: "Invalid action or membership" };
    }
    const mutation = {
      fieldId: body.fieldId,
      value: body.value,
      clientId: body.clientId ?? `legacy-${crypto.randomUUID()}`,
      sequence: body.sequence ?? 1,
    };
    if (!isFieldMutation(mutation)) {
      await send({
        type: "sync-error",
        code: "invalid",
        error: "Invalid change.",
      });
      return { statusCode: 400, body: "Invalid change" };
    }
    const user = await UserStore.make().getUser(connection.user_id);
    try {
      const result = await applyCheckMutation({
        id: truckCheckId,
        userId: connection.user_id,
        contributor: { first_name: user.first_name, last_name: user.last_name },
        mutation,
        legacy: !body.clientId,
        publish: broadcast,
      });
      await send({ type: "field-acknowledged", truckCheckId, ...result });
    } catch (error) {
      // Locked checks are view-only, whether locked by their creator or by the
      // hourly lock task, so the sender is told to switch to view-only instead.
      if (error instanceof TruckCheckLocked) {
        await send({ type: "truck-check-locked", truckCheckId });
      } else {
        throw error;
      }
    }
    return { statusCode: 200, body: "Field updated" };
  } catch (error) {
    log.error("truck_check_websocket_failed", {
      connectionId,
      eventType,
      error: error instanceof Error ? error.name : "unknown",
    });
    if (eventType === "MESSAGE")
      await send({
        type: "sync-error",
        code: "retry",
        error: "Unable to synchronize. Retry or reconnect.",
      }).catch(() => {});
    return { statusCode: 500, body: "Unable to process event" };
  } finally {
    log.info("truck_check_websocket", {
      connectionId,
      eventType,
      durationMs: Date.now() - started,
    });
  }
};
