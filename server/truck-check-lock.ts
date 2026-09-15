import type { ScheduledHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { instrumentAwsSdkClient } from "~/lib/aws-xray.server";
import { log } from "~/lib/logger";
import {
  notifyTruckCheckIssues,
  type NotifiableTruckCheck,
} from "~/lib/truck-check/issue-notifications";

const dynamoClient = new DynamoDBClient({});
const docClient = instrumentAwsSdkClient(
  DynamoDBDocumentClient.from(dynamoClient),
);

const LOCK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const handler: ScheduledHandler = async (event) => {
  log.info("Truck check lock task triggered at:", new Date().toISOString());
  log.info("Event:", event);

  const tableName = process.env.TRUCK_CHECKS_TABLE_NAME;
  if (!tableName) {
    throw new Error("TRUCK_CHECKS_TABLE_NAME environment variable not set");
  }

  try {
    const truckChecks: Record<string, any>[] = [];
    let key: Record<string, any> | undefined;
    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "locked = :unlocked",
          ExpressionAttributeValues: { ":unlocked": false },
          ExclusiveStartKey: key,
        }),
      );
      truckChecks.push(...(result.Items || []));
      key = result.LastEvaluatedKey;
    } while (key);
    const now = Date.now();
    const lockedChecks: NotifiableTruckCheck[] = [];

    for (const check of truckChecks) {
      const createdAt = new Date(check.created_at).getTime();
      const age = now - createdAt;

      if (age > LOCK_AGE_MS) {
        const locked = await docClient
          .send(
            new UpdateCommand({
              TableName: tableName,
              Key: { id: check.id },
              ConditionExpression:
                "attribute_exists(id) AND locked = :unlocked",
              UpdateExpression:
                "SET locked = :locked, updated_at = :now ADD revision :one",
              ExpressionAttributeValues: {
                ":locked": true,
                ":unlocked": false,
                ":one": 1,
                ":now": new Date().toISOString(),
              },
              ReturnValues: "ALL_NEW",
            }),
          )
          .catch((error: unknown) => {
            if (
              error instanceof Error &&
              error.name === "ConditionalCheckFailedException"
            )
              return null;
            throw error;
          });
        if (!locked?.Attributes) continue;

        log.info(
          `Locked truck check ${check.id} (created ${check.created_at})`,
        );
        lockedChecks.push(locked.Attributes as NotifiableTruckCheck);
      }
    }

    log.info(
      `Truck check lock task completed: ${lockedChecks.length} of ${truckChecks.length} unlocked checks were locked`,
    );

    if (lockedChecks.length > 0) {
      try {
        await notifyTruckCheckIssues({ checks: lockedChecks });
      } catch (error) {
        // Notification failures must never fail the locking job
        log.error("Failed to send truck check issue notifications", {
          error: String(error),
        });
      }
    }
  } catch (error) {
    log.error("Error in truck check lock task:", error);
    throw error;
  }
};
