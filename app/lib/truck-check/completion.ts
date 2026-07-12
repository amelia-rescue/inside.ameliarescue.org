import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
  type Truck,
} from "./truck-check-schema-store";
import type { TruckCheck } from "./truck-check-store";

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
    const truck = trucks.find((t) => t.truckId === check.truck);
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
    } catch {
      return null;
    }
  }
  return schema;
}

export async function calculateCompletion(
  check: TruckCheck,
  trucks: Truck[],
  schemaStore: TruckCheckSchemaStore,
  cache: Map<string, TruckCheckSchema> = new Map(),
): Promise<CompletionResult> {
  const schema = await resolveSchema(check, trucks, schemaStore, cache);
  if (!schema) {
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
    requiredTotal > 0 && requiredCompleted / requiredTotal >= 0.75;

  return { requiredCompleted, requiredTotal, isComplete };
}
