import type { ScheduledHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { log } from "~/lib/logger";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LOCK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const handler: ScheduledHandler = async (event) => {
  log.info("Truck check lock task triggered at:", new Date().toISOString());
  log.info("Event:", event);

  const tableName = process.env.TRUCK_CHECKS_TABLE_NAME;
  if (!tableName) {
    throw new Error("TRUCK_CHECKS_TABLE_NAME environment variable not set");
  }

  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "locked = :unlocked",
        ExpressionAttributeValues: {
          ":unlocked": false,
        },
      }),
    );

    const truckChecks = result.Items || [];
    const now = Date.now();
    let lockedCount = 0;

    for (const check of truckChecks) {
      const createdAt = new Date(check.created_at).getTime();
      const age = now - createdAt;

      if (age > LOCK_AGE_MS) {
        await docClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: check.id },
            UpdateExpression: "SET locked = :locked, updated_at = :now",
            ExpressionAttributeValues: {
              ":locked": true,
              ":now": new Date().toISOString(),
            },
          }),
        );

        log.info(
          `Locked truck check ${check.id} (created ${check.created_at})`,
        );
        lockedCount++;
      }
    }

    log.info(
      `Truck check lock task completed: ${lockedCount} of ${truckChecks.length} unlocked checks were locked`,
    );
  } catch (error) {
    log.error("Error in truck check lock task:", error);
    throw error;
  }
};
