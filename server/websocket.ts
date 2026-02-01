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
  const counterTableName = process.env.COUNTER_STATE_TABLE_NAME;

  log.info("event data", { event });

  if (!connectionsTableName || !counterTableName) {
    console.error("Required environment variables not set");
    return { statusCode: 500, body: "Configuration error" };
  }

  try {
    switch (eventType) {
      case "CONNECT":
        return await handleConnect(event, connectionId, connectionsTableName);

      case "DISCONNECT":
        return await handleDisconnect(connectionId, connectionsTableName);

      case "MESSAGE":
        return await handleMessage(
          event,
          connectionId,
          domainName,
          stage,
          connectionsTableName,
          counterTableName,
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
): Promise<{ statusCode: number; body: string }> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { connectionId },
      }),
    );

    console.log(`Connection closed: ${connectionId}`);
    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Error removing connection:", error);
    return { statusCode: 500, body: "Failed to disconnect" };
  }
}

async function handleMessage(
  event: any,
  connectionId: string,
  domainName: string,
  stage: string,
  connectionsTableName: string,
  counterTableName: string,
): Promise<{ statusCode: number; body: string }> {
  const apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action;

    if (action === "increment") {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: counterTableName,
          Key: { counterId: "global" },
          UpdateExpression:
            "SET #value = if_not_exists(#value, :zero) + :inc, updatedAt = :now",
          ExpressionAttributeNames: {
            "#value": "value",
          },
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
            ":now": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      const newValue = result.Attributes?.value || 0;

      const connectionsResult = await docClient.send(
        new ScanCommand({
          TableName: connectionsTableName,
        }),
      );

      const connections = connectionsResult.Items || [];

      const broadcastPromises = connections.map(async (connection) => {
        try {
          await apiGatewayClient.send(
            new PostToConnectionCommand({
              ConnectionId: connection.connectionId,
              Data: JSON.stringify({
                type: "counter-update",
                value: newValue,
              }),
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
            console.error(
              `Error sending to ${connection.connectionId}:`,
              error,
            );
          }
        }
      });

      await Promise.all(broadcastPromises);

      return { statusCode: 200, body: "Counter incremented" };
    } else if (action === "get-current") {
      const result = await docClient.send(
        new GetCommand({
          TableName: counterTableName,
          Key: { counterId: "global" },
        }),
      );

      const currentValue = result.Item?.value || 0;

      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            type: "counter-update",
            value: currentValue,
          }),
        }),
      );

      return { statusCode: 200, body: "Current value sent" };
    }

    return { statusCode: 400, body: "Unknown action" };
  } catch (error) {
    console.error("Error processing message:", error);
    return { statusCode: 500, body: "Failed to process message" };
  }
}
