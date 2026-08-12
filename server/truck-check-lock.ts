import type { ScheduledHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { log } from "~/lib/logger";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import { extractIssues, hasIssues } from "~/lib/truck-check/issues";
import { EmailService } from "~/lib/email-service";
import { UserStore } from "~/lib/user-store";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const LOCK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type LockedCheck = {
  id: string;
  truck: string;
  created_at: string;
  data: Record<string, unknown>;
  schema_id?: string;
  schema_created_at?: string;
};

async function resolveSchema(
  check: LockedCheck,
  schemaStore: TruckCheckSchemaStore,
  cache: Map<string, TruckCheckSchema>,
): Promise<TruckCheckSchema | null> {
  let key: string;
  let lookup: () => Promise<TruckCheckSchema>;

  if (check.schema_id && check.schema_created_at) {
    key = `${check.schema_id}:${check.schema_created_at}`;
    lookup = () =>
      schemaStore.getSchemaVersion(
        check.schema_id as string,
        check.schema_created_at as string,
      );
  } else {
    key = `truck:${check.truck}`;
    lookup = async () => {
      const truck = await schemaStore.getTruck(check.truck);
      return schemaStore.getSchema(truck.schemaId);
    };
  }

  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  try {
    const schema = await lookup();
    cache.set(key, schema);
    return schema;
  } catch (error) {
    log.warn("Failed to resolve schema for locked truck check", {
      checkId: check.id,
      key,
      error: String(error),
    });
    return null;
  }
}

async function emailIssues(lockedChecks: LockedCheck[]): Promise<void> {
  const userStore = UserStore.make();
  const subscribers = await userStore.listTruckCheckIssueSubscribers();
  if (subscribers.length === 0) {
    log.info("No truck check issue email subscribers, skipping notifications");
    return;
  }

  const schemaStore = TruckCheckSchemaStore.make();
  const emailService = EmailService.make();
  const schemaCache = new Map<string, TruckCheckSchema>();
  const truckNameCache = new Map<string, string>();

  for (const check of lockedChecks) {
    const schema = await resolveSchema(check, schemaStore, schemaCache);
    if (!schema) {
      continue;
    }

    const issues = extractIssues({ data: check.data ?? {}, schema });
    if (!hasIssues(issues)) {
      continue;
    }

    let truckName = truckNameCache.get(check.truck);
    if (!truckName) {
      try {
        truckName = (await schemaStore.getTruck(check.truck)).displayName;
      } catch {
        truckName = check.truck;
      }
      truckNameCache.set(check.truck, truckName);
    }

    for (const subscriber of subscribers) {
      try {
        await emailService.sendTruckCheckIssuesEmail({
          toEmail: subscriber.email,
          truckName,
          checkId: check.id,
          checkedAt: check.created_at,
          problemSections: issues.problemSections,
          textNotes: issues.textNotes,
          photos: issues.photos,
        });
      } catch (error) {
        log.error("Failed to send truck check issue email", {
          checkId: check.id,
          to_email: subscriber.email,
          error: String(error),
        });
      }
    }
  }
}

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
    const lockedChecks: LockedCheck[] = [];

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
        lockedChecks.push(check as LockedCheck);
      }
    }

    log.info(
      `Truck check lock task completed: ${lockedChecks.length} of ${truckChecks.length} unlocked checks were locked`,
    );

    if (lockedChecks.length > 0) {
      try {
        await emailIssues(lockedChecks);
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
