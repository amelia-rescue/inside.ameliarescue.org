import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from "aws-lambda";
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
import type { ApiGatewayWebSocketEvent } from "types/apigateway";
import { getUserInfo } from "~/lib/auth.server";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: ApiGatewayWebSocketEvent) => {
  const { connectionId, eventType, domainName, stage } = event.requestContext;
  const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
  const truckChecksTableName = process.env.TRUCK_CHECKS_TABLE_NAME;
  const usersTableName = process.env.USERS_TABLE_NAME;

  log.info("event data", { event });

  if (!connectionsTableName) {
    console.error("Required environment variables not set");
    return { statusCode: 500, body: "Configuration error" };
  }

  try {
    switch (eventType) {
      case "CONNECT":
        return await handleConnect(event, connectionId, connectionsTableName);

      case "DISCONNECT":
        return await handleDisconnect(
          connectionId,
          connectionsTableName,
          truckChecksTableName,
          domainName,
          stage,
        );

      case "MESSAGE":
        return await handleMessage(
          event,
          connectionId,
          domainName,
          stage,
          connectionsTableName,
          truckChecksTableName,
          usersTableName,
        );

      default:
        console.warn(`Unknown event type: ${eventType}`);
        return { statusCode: 400, body: "Unknown event type" };
    }
  } catch (error) {
    console.error("Error handling WebSocket event:", error);
    return { statusCode: 500, body: "Internal server error" };
  }
};

async function handleConnect(
  event: ApiGatewayWebSocketEvent,
  connectionId: string,
  tableName: string,
): Promise<{ statusCode: number; body: string }> {
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

async function handleDisconnect(
  connectionId: string,
  tableName: string,
  truckChecksTableName: string | undefined,
  domainName: string,
  stage: string,
): Promise<{ statusCode: number; body: string }> {
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

      const connectedUsers = await getConnectedUsersForTruckCheck(
        tableName,
        truckCheckId,
      );

      await broadcastToTruckCheck(
        apiGatewayClient,
        tableName,
        truckCheckId,
        {
          type: "user-left",
          userId,
          userName: userName || "Unknown",
          connectedUsers,
        },
        undefined,
      );
    }

    console.log(`Connection closed: ${connectionId}`);
    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Error removing connection:", error);
    return { statusCode: 500, body: "Failed to disconnect" };
  }
}

async function getConnectedUsersForTruckCheck(
  connectionsTableName: string,
  truckCheckId: string,
): Promise<{ userId: string; userName: string }[]> {
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

async function broadcastToTruckCheck(
  apiGatewayClient: ApiGatewayManagementApiClient,
  connectionsTableName: string,
  truckCheckId: string,
  message: Record<string, any>,
  excludeConnectionId: string | undefined,
): Promise<void> {
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

async function sendToConnection(
  apiGatewayClient: ApiGatewayManagementApiClient,
  connectionId: string,
  message: Record<string, any>,
): Promise<void> {
  await apiGatewayClient.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(message),
    }),
  );
}

async function handleMessage(
  event: any,
  connectionId: string,
  domainName: string,
  stage: string,
  connectionsTableName: string,
  truckChecksTableName: string | undefined,
  usersTableName: string | undefined,
): Promise<{ statusCode: number; body: string }> {
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action;

    if (action === "join-truck-check") {
      return await handleJoinTruckCheck(
        apiGatewayClient,
        connectionId,
        connectionsTableName,
        truckChecksTableName,
        usersTableName,
        body.truckCheckId,
      );
    } else if (action === "update-field") {
      return await handleUpdateField(
        apiGatewayClient,
        connectionId,
        connectionsTableName,
        truckChecksTableName,
        body.truckCheckId,
        body.fieldId,
        body.value,
      );
    }

    return { statusCode: 400, body: "Unknown action" };
  } catch (error) {
    console.error("Error processing message:", error);
    return { statusCode: 500, body: "Failed to process message" };
  }
}

async function handleJoinTruckCheck(
  apiGatewayClient: ApiGatewayManagementApiClient,
  connectionId: string,
  connectionsTableName: string,
  truckChecksTableName: string | undefined,
  usersTableName: string | undefined,
  truckCheckId: string,
): Promise<{ statusCode: number; body: string }> {
  if (!truckChecksTableName || !truckCheckId) {
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

  let userName = "Unknown";
  if (usersTableName && userId) {
    try {
      const userResult = await docClient.send(
        new GetCommand({
          TableName: usersTableName,
          Key: { user_id: userId },
        }),
      );
      if (userResult.Item) {
        userName = `${userResult.Item.first_name} ${userResult.Item.last_name}`;
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

  const truckCheckResult = await docClient.send(
    new GetCommand({
      TableName: truckChecksTableName,
      Key: { id: truckCheckId },
    }),
  );

  const truckCheck = truckCheckResult.Item;
  if (!truckCheck) {
    return { statusCode: 404, body: "Truck check not found" };
  }

  const contributors: string[] = truckCheck.contributors || [];
  if (userId && !contributors.includes(userId)) {
    contributors.push(userId);
    await docClient.send(
      new UpdateCommand({
        TableName: truckChecksTableName,
        Key: { id: truckCheckId },
        UpdateExpression: "SET contributors = :contributors",
        ExpressionAttributeValues: {
          ":contributors": contributors,
        },
      }),
    );
    truckCheck.contributors = contributors;
  }

  let contributorNames: { userId: string; userName: string }[] = [];
  if (usersTableName) {
    const namePromises = contributors.map(async (cId: string) => {
      try {
        const userResult = await docClient.send(
          new GetCommand({
            TableName: usersTableName,
            Key: { user_id: cId },
          }),
        );
        return {
          userId: cId,
          userName: userResult.Item
            ? `${userResult.Item.first_name} ${userResult.Item.last_name}`
            : "Unknown",
        };
      } catch {
        return { userId: cId, userName: "Unknown" };
      }
    });
    contributorNames = await Promise.all(namePromises);
  }

  const connectedUsers = await getConnectedUsersForTruckCheck(
    connectionsTableName,
    truckCheckId,
  );

  await sendToConnection(apiGatewayClient, connectionId, {
    type: "truck-check-joined",
    truckCheckData: truckCheck.data || {},
    connectedUsers,
    contributors: contributorNames,
  });

  await broadcastToTruckCheck(
    apiGatewayClient,
    connectionsTableName,
    truckCheckId,
    {
      type: "user-joined",
      userId,
      userName,
      connectedUsers,
      contributors: contributorNames,
    },
    connectionId,
  );

  return { statusCode: 200, body: "Joined truck check" };
}

async function handleUpdateField(
  apiGatewayClient: ApiGatewayManagementApiClient,
  connectionId: string,
  connectionsTableName: string,
  truckChecksTableName: string | undefined,
  truckCheckId: string,
  fieldId: string,
  value: any,
): Promise<{ statusCode: number; body: string }> {
  if (!truckChecksTableName || !truckCheckId || !fieldId) {
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

  await docClient.send(
    new UpdateCommand({
      TableName: truckChecksTableName,
      Key: { id: truckCheckId },
      UpdateExpression: "SET #data.#fieldId = :value, updated_at = :now",
      ExpressionAttributeNames: {
        "#data": "data",
        "#fieldId": fieldId,
      },
      ExpressionAttributeValues: {
        ":value": value,
        ":now": new Date().toISOString(),
      },
    }),
  );

  await broadcastToTruckCheck(
    apiGatewayClient,
    connectionsTableName,
    truckCheckId,
    {
      type: "field-update",
      fieldId,
      value,
      updatedBy: connection.user_id,
      updatedByName: connection.userName || "Unknown",
    },
    connectionId,
  );

  return { statusCode: 200, body: "Field updated" };
}
