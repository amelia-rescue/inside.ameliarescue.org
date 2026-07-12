import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
  type Truck,
} from "./truck-check-schema-store";
import type { TruckCheck } from "./truck-check-store";
import { log } from "../logger";

dayjs.extend(utc);
dayjs.extend(timezone);

export type CompletionResult = {
  requiredCompleted: number;
  requiredTotal: number;
  isComplete: boolean;
};

function getFieldId(sectionId: string, fieldLabel: string): string {
  return `${sectionId}-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

async function resolveSchema(
  check: TruckCheck,
  trucks: Truck[],
  schemaStore: TruckCheckSchemaStore,
  cache: Map<string, TruckCheckSchema>,
): Promise<TruckCheckSchema | null> {
  let key: string | null = null;
  let lookup: (() => Promise<TruckCheckSchema>) | null = null;

  if (check.schema_id && check.schema_created_at) {
    key = `${check.schema_id}:${check.schema_created_at}`;
    lookup = () =>
      schemaStore.getSchemaVersion(
        check.schema_id as string,
        check.schema_created_at as string,
      );
  } else {
    let truck = trucks.find((t) => t.truckId === check.truck);
    if (!truck) {
      try {
        truck = await schemaStore.getTruck(check.truck);
      } catch (error) {
        log.warn("truck not found in list or store", {
          truckId: check.truck,
          error: String(error),
        });
      }
    }
    if (truck) {
      key = `${truck.schemaId}:latest`;
      lookup = () => schemaStore.getSchema(truck.schemaId);
    }
  }

  if (!key || !lookup) return null;

  let schema = cache.get(key);
  if (!schema) {
    try {
      schema = await lookup();
      cache.set(key, schema);
    } catch (error) {
      log.warn("schema lookup failed", { key, error: String(error) });
      return null;
    }
  }
  return schema;
}

export async function calculateCompletion({
  check,
  trucks,
  schemaStore,
  cache = new Map(),
  completedPercent = 0.75,
}: {
  check: TruckCheck;
  trucks: Truck[];
  schemaStore: TruckCheckSchemaStore;
  cache?: Map<string, TruckCheckSchema>;
  completedPercent?: number;
}): Promise<CompletionResult> {
  const schema = await resolveSchema(check, trucks, schemaStore, cache);
  if (!schema) {
    log.warn("schema not found for truck check", {
      checkId: check.id,
      truck: check.truck,
      schema_id: check.schema_id,
      schema_created_at: check.schema_created_at,
    });
    return { requiredCompleted: 0, requiredTotal: 0, isComplete: false };
  }

  const requiredFieldIds = schema.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.required)
      .map((field) => getFieldId(section.id, field.label)),
  );

  const requiredCompleted = requiredFieldIds.filter((fieldId) =>
    isFieldFilled(check.data[fieldId]),
  ).length;

  const requiredTotal = requiredFieldIds.length;
  const isComplete =
    requiredTotal > 0 && requiredCompleted / requiredTotal >= completedPercent;

  log.info("truck check completion calculated", {
    requiredCompleted,
    requiredTotal,
    isComplete,
  });

  return { requiredCompleted, requiredTotal, isComplete };
}
