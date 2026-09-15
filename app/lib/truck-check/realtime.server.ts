import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { instrumentAwsSdkClient } from "~/lib/aws-xray.server";
import { log } from "~/lib/logger";

const documentClient = instrumentAwsSdkClient(
  DynamoDBDocumentClient.from(new DynamoDBClient({})),
);

export async function getConnections(
  connectionsTableName: string,
  truckCheckId: string,
) {
  const connections: Record<string, any>[] = [];
  let key: Record<string, any> | undefined;
  do {
    const page = await documentClient.send(
      new ScanCommand({
        TableName: connectionsTableName,
        FilterExpression: "truckCheckId = :id",
        ExpressionAttributeValues: { ":id": truckCheckId },
        ExclusiveStartKey: key,
        ConsistentRead: true,
      }),
    );
    connections.push(
      ...(page.Items || []).filter((c) => !c.ttl || c.ttl > Date.now() / 1000),
    );
    key = page.LastEvaluatedKey;
  } while (key);
  return connections;
}

export async function getConnectedUsersForTruckCheck({
  connectionsTableName,
  truckCheckId,
}: {
  connectionsTableName: string;
  truckCheckId: string;
}) {
  const users = new Map<string, string>();
  for (const connection of await getConnections(
    connectionsTableName,
    truckCheckId,
  )) {
    if (connection.user_id)
      users.set(connection.user_id, connection.userName || "Unknown");
  }
  return Array.from(users, ([userId, userName]) => ({ userId, userName }));
}

export async function sendToConnection({
  apiGatewayClient,
  connectionId,
  message,
}: {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionId: string;
  message: Record<string, unknown>;
}) {
  await apiGatewayClient.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(message),
    }),
  );
}

export async function broadcastToTruckCheck({
  apiGatewayClient,
  connectionsTableName,
  truckCheckId,
  message,
  excludeConnectionId,
}: {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionsTableName: string;
  truckCheckId: string;
  message: Record<string, unknown>;
  excludeConnectionId?: string;
}) {
  const connections = await getConnections(connectionsTableName, truckCheckId);
  await Promise.all(
    connections
      .filter((c) => c.connectionId !== excludeConnectionId)
      .map(async (connection) => {
        try {
          await sendToConnection({
            apiGatewayClient,
            connectionId: connection.connectionId,
            message,
          });
        } catch (error: any) {
          if (
            error.name === "GoneException" ||
            error.$metadata?.httpStatusCode === 410 ||
            error.statusCode === 410
          ) {
            await documentClient.send(
              new DeleteCommand({
                TableName: connectionsTableName,
                Key: { connectionId: connection.connectionId },
              }),
            );
          } else {
            log.warn("truck_check_broadcast_failed", {
              truckCheckId,
              connectionId: connection.connectionId,
              error: error.name,
            });
          }
        }
      }),
  );
}

export async function publishCheckEvent(
  truckCheckId: string,
  message: Record<string, unknown>,
) {
  const endpoint = process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;
  const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
  if (!endpoint || !connectionsTableName) return;
  await broadcastToTruckCheck({
    apiGatewayClient: instrumentAwsSdkClient(
      new ApiGatewayManagementApiClient({ endpoint }),
    ),
    connectionsTableName,
    truckCheckId,
    message,
  });
}
