import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
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

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const { connectionId, eventType, domainName, stage } =
    event.requestContext;
  const connectionsTableName = process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME;
  const counterTableName = process.env.COUNTER_STATE_TABLE_NAME;

  if (!connectionsTableName || !counterTableName) {
    console.error("Required environment variables not set");
    return { statusCode: 500, body: "Configuration error" };
  }

  try {
    switch (eventType) {
      case "CONNECT":
        return await handleConnect(
          connectionId,
          connectionsTableName,
        );

      case "DISCONNECT":
        return await handleDisconnect(
          connectionId,
          connectionsTableName,
        );

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
  connectionId: string,
  tableName: string,
): Promise<{ statusCode: number; body: string }> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + 7200;

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          connectionId,
          connectedAt: new Date().toISOString(),
          ttl,
        },
      }),
    );

    console.log(`Connection established: ${connectionId}`);
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
