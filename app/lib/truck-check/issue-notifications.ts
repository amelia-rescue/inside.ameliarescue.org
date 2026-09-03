import { log } from "~/lib/logger";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import { extractIssues, hasIssues } from "~/lib/truck-check/issues";
import { EmailService } from "~/lib/email-service";
import { UserStore } from "~/lib/user-store";

export type NotifiableTruckCheck = {
  id: string;
  truck: string;
  created_at: string;
  data: Record<string, unknown>;
  schema_id?: string;
  schema_created_at?: string;
};

async function resolveSchema(
  check: NotifiableTruckCheck,
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

/**
 * Emails the issue subscribers about truck checks that were just locked,
 * whether by the hourly lock task or by the creator locking manually.
 */
export async function notifyTruckCheckIssues({
  checks,
}: {
  checks: NotifiableTruckCheck[];
}): Promise<void> {
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

  for (const check of checks) {
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
