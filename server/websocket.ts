import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { log } from "~/lib/logger";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import type { ApiGatewayWebSocketEvent } from "types/apigateway";
import { getUserInfo } from "~/lib/auth.server";
import { UserStore } from "~/lib/user-store";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

type HandlerResponse = { statusCode: number; body: string };
type ConnectedUser = { userId: string; userName: string };

type HandleConnectParams = {
  event: ApiGatewayWebSocketEvent;
  connectionId: string;
  tableName: string;
};

type HandleDisconnectParams = {
  connectionId: string;
  tableName: string;
  domainName: string;
  stage: string;
};

type GetConnectedUsersForTruckCheckParams = {
  connectionsTableName: string;
  truckCheckId: string;
};

type BroadcastToTruckCheckParams = {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionsTableName: string;
  truckCheckId: string;
  message: Record<string, unknown>;
  excludeConnectionId?: string;
};

type SendToConnectionParams = {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionId: string;
  message: Record<string, unknown>;
};

type HandleMessageParams = {
  event: ApiGatewayWebSocketEvent & { body?: string };
  connectionId: string;
  domainName: string;
  stage: string;
  connectionsTableName: string;
};

type HandleJoinTruckCheckParams = {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionId: string;
  connectionsTableName: string;
  truckCheckId: string;
};

type HandleUpdateFieldParams = {
  apiGatewayClient: ApiGatewayManagementApiClient;
  connectionId: string;
  connectionsTableName: string;
  truckCheckId: string;
  fieldId: string;
  value: unknown;
};

export const handler = async (event: ApiGatewayWebSocketEvent) => {
  const { connectionId, eventType, domainName, stage } = event.requestContext;
  const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;

  log.info("event data", { event });

  if (!connectionsTableName) {
    console.error("Required environment variables not set");
    return { statusCode: 500, body: "Configuration error" };
  }

  try {
    switch (eventType) {
      case "CONNECT":
        return await handleConnect({
          event,
          connectionId,
          tableName: connectionsTableName,
        });

      case "DISCONNECT":
        return await handleDisconnect({
          connectionId,
          tableName: connectionsTableName,
          domainName,
          stage,
        });

      case "MESSAGE":
        return await handleMessage({
          event,
          connectionId,
          domainName,
          stage,
          connectionsTableName,
        });

      default:
        console.warn(`Unknown event type: ${eventType}`);
        return { statusCode: 400, body: "Unknown event type" };
    }
  } catch (error) {
    console.error("Error handling WebSocket event:", error);
    return { statusCode: 500, body: "Internal server error" };
  }
};

async function handleConnect({
  event,
  connectionId,
  tableName,
}: HandleConnectParams): Promise<HandlerResponse> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 7200;

    const access_token = event.queryStringParameters?.access_token;
    if (!access_token) {
      throw new Error("access token required for authentication");
    }
    const userInfo = await getUserInfo(access_token);
    const user_id = userInfo.sub;
    if (typeof user_id !== "string") {
      throw new Error("unable to get user_id from access token");
    }

    log.info("WebSocket connection with authenticated user", {
      connectionId,
      user_id,
    });

    const item: Record<string, any> = {
      connectionId,
      connectedAt: new Date().toISOString(),
      ttl,
      user_id,
    };

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    console.log(`Connection established: ${connectionId}`, { user_id });
    return { statusCode: 200, body: "Connected" };
  } catch (error) {
    console.error("Error storing connection:", error);
    return { statusCode: 500, body: "Failed to connect" };
  }
}

async function handleDisconnect({
  connectionId,
  tableName,
  domainName,
  stage,
}: HandleDisconnectParams): Promise<HandlerResponse> {
  try {
    const connectionResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { connectionId },
      }),
    );

    const connection = connectionResult.Item;
    const truckCheckId = connection?.truckCheckId;
    const userId = connection?.user_id;
    const userName = connection?.userName;

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { connectionId },
      }),
    );

    if (truckCheckId && userId) {
      const apiGatewayClient = new ApiGatewayManagementApiClient({
        endpoint: `https://${domainName}/${stage}`,
      });

      const connectedUsers = await getConnectedUsersForTruckCheck({
        connectionsTableName: tableName,
        truckCheckId,
      });

      await broadcastToTruckCheck({
        apiGatewayClient,
        connectionsTableName: tableName,
        truckCheckId,
        message: {
          type: "user-left",
          userId,
          userName: userName || "Unknown",
          connectedUsers,
        },
      });
    }

    console.log(`Connection closed: ${connectionId}`);
    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Error removing connection:", error);
    return { statusCode: 500, body: "Failed to disconnect" };
  }
}

async function getConnectedUsersForTruckCheck({
  connectionsTableName,
  truckCheckId,
}: GetConnectedUsersForTruckCheckParams): Promise<ConnectedUser[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: connectionsTableName,
      FilterExpression: "truckCheckId = :tcId",
      ExpressionAttributeValues: {
        ":tcId": truckCheckId,
      },
    }),
  );

  const connections = result.Items || [];
  const uniqueUsers = new Map<string, string>();
  for (const conn of connections) {
    if (conn.user_id && !uniqueUsers.has(conn.user_id)) {
      uniqueUsers.set(conn.user_id, conn.userName || "Unknown");
    }
  }

  return Array.from(uniqueUsers.entries()).map(([userId, userName]) => ({
    userId,
    userName,
  }));
}

async function broadcastToTruckCheck({
  apiGatewayClient,
  connectionsTableName,
  truckCheckId,
  message,
  excludeConnectionId,
}: BroadcastToTruckCheckParams): Promise<void> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: connectionsTableName,
      FilterExpression: "truckCheckId = :tcId",
      ExpressionAttributeValues: {
        ":tcId": truckCheckId,
      },
    }),
  );

  const connections = (result.Items || []).filter(
    (c) => c.connectionId !== excludeConnectionId,
  );

  const broadcastPromises = connections.map(async (connection) => {
    try {
      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: JSON.stringify(message),
        }),
      );
    } catch (error: any) {
      if (error.statusCode === 410) {
        console.log(`Stale connection: ${connection.connectionId}`);
        await docClient.send(
          new DeleteCommand({
            TableName: connectionsTableName,
            Key: { connectionId: connection.connectionId },
          }),
        );
      } else {
        console.error(`Error sending to ${connection.connectionId}:`, error);
      }
    }
  });

  await Promise.all(broadcastPromises);
}

async function sendToConnection({
  apiGatewayClient,
  connectionId,
  message,
}: SendToConnectionParams): Promise<void> {
  await apiGatewayClient.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(message),
    }),
  );
}

async function handleMessage({
  event,
  connectionId,
  domainName,
  stage,
  connectionsTableName,
}: HandleMessageParams): Promise<HandlerResponse> {
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action;

    if (action === "join-truck-check") {
      return await handleJoinTruckCheck({
        apiGatewayClient,
        connectionId,
        connectionsTableName,
        truckCheckId: body.truckCheckId,
      });
    } else if (action === "update-field") {
      return await handleUpdateField({
        apiGatewayClient,
        connectionId,
        connectionsTableName,
        truckCheckId: body.truckCheckId,
        fieldId: body.fieldId,
        value: body.value,
      });
    }

    return { statusCode: 400, body: "Unknown action" };
  } catch (error) {
    console.error("Error processing message:", error);
    return { statusCode: 500, body: "Failed to process message" };
  }
}

async function handleJoinTruckCheck({
  apiGatewayClient,
  connectionId,
  connectionsTableName,
  truckCheckId,
}: HandleJoinTruckCheckParams): Promise<HandlerResponse> {
  if (!truckCheckId) {
    return { statusCode: 400, body: "Missing truckCheckId or table config" };
  }

  const connectionResult = await docClient.send(
    new GetCommand({
      TableName: connectionsTableName,
      Key: { connectionId },
    }),
  );

  const connection = connectionResult.Item;
  if (!connection) {
    return { statusCode: 400, body: "Connection not found" };
  }

  const userId = connection.user_id;
  const userStore = UserStore.make();

  let userName = "Unknown";
  if (userId) {
    try {
      const user = await userStore.getUser(userId);
      if (user) {
        userName = `${user.first_name} ${user.last_name}`;
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  }

  await docClient.send(
    new UpdateCommand({
      TableName: connectionsTableName,
      Key: { connectionId },
      UpdateExpression: "SET truckCheckId = :tcId, userName = :name",
      ExpressionAttributeValues: {
        ":tcId": truckCheckId,
        ":name": userName,
      },
    }),
  );

  const truckCheckStore = TruckCheckStore.make();

  const contributors: string[] = [];
  if (userId && !contributors.includes(userId)) {
    contributors.push(userId);
    await truckCheckStore.updateTruckCheck({
      id: truckCheckId,
      contributors,
    });
  }

  let contributorNames: { userId: string; userName: string }[] = [];
  const namePromises = contributors.map(async (cId: string) => {
    try {
      const userResult = await userStore.getUser(userId, {
        includeDeleted: true,
      });
      return {
        userId: cId,
        userName: `${userResult.first_name} ${userResult.last_name}`,
      };
    } catch {
      return { userId: cId, userName: "Unknown" };
    }
  });
  contributorNames = await Promise.all(namePromises);

  const connectedUsers = await getConnectedUsersForTruckCheck({
    connectionsTableName,
    truckCheckId,
  });

  const truckCheck = await truckCheckStore.getTruckCheck(truckCheckId);

  await sendToConnection({
    apiGatewayClient,
    connectionId,
    message: {
      type: "truck-check-joined",
      truckCheckData: truckCheck.data || {},
      connectedUsers,
      contributors: contributorNames,
    },
  });

  await broadcastToTruckCheck({
    apiGatewayClient,
    connectionsTableName,
    truckCheckId,
    message: {
      type: "user-joined",
      userId,
      userName,
      connectedUsers,
      contributors: contributorNames,
    },
    excludeConnectionId: connectionId,
  });

  return { statusCode: 200, body: "Joined truck check" };
}

async function handleUpdateField({
  apiGatewayClient,
  connectionId,
  connectionsTableName,
  truckCheckId,
  fieldId,
  value,
}: HandleUpdateFieldParams): Promise<HandlerResponse> {
  if (!truckCheckId || !fieldId) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  const connectionResult = await docClient.send(
    new GetCommand({
      TableName: connectionsTableName,
      Key: { connectionId },
    }),
  );

  const connection = connectionResult.Item;
  if (!connection) {
    return { statusCode: 400, body: "Connection not found" };
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheck = await truckCheckStore.getTruckCheck(truckCheckId);
  const updatedTruckCheck = await truckCheckStore.updateTruckCheck({
    ...truckCheck,
    data: { ...truckCheck.data, [fieldId]: value },
  });

  await broadcastToTruckCheck({
    apiGatewayClient,
    connectionsTableName,
    truckCheckId,
    message: {
      type: "field-update",
      truckCheckData: updatedTruckCheck.data,
      fieldId,
      value,
      updatedBy: connection.user_id,
      updatedByName: connection.userName || "Unknown",
    },
    excludeConnectionId: connectionId,
  });

  return { statusCode: 200, body: "Field updated" };
}
