import { TruckCheckStore, type DocumentTruckCheck } from "./truck-check-store";
import {
  TruckCheckSchemaStore,
  type SchemaField,
} from "./truck-check-schema-store";
import { calculateCompletion } from "./completion";
import { getFieldId } from "./issues";
import { publishCheckEvent } from "./realtime.server";
import { log } from "~/lib/logger";
import type { FieldMutation, CheckSnapshot } from "./sync-protocol";

export class InvalidFieldMutation extends Error {}

export function toSnapshot(
  check: DocumentTruckCheck,
  userId: string,
): CheckSnapshot {
  return {
    id: check.id,
    userId,
    revision: check.revision ?? 0,
    data: check.data ?? {},
    contributors: check.contributors ?? {},
    locked: check.locked,
  };
}

export function validFieldValue(field: SchemaField, value: unknown): boolean {
  switch (field.type) {
    case "checkbox":
      return (
        value === null ||
        value === true ||
        value === false ||
        value === "not-present"
      );
    case "text":
      return (
        typeof value === "string" && value.length <= (field.maxLength ?? 10000)
      );
    case "number":
      return (
        value === null || (typeof value === "number" && Number.isFinite(value))
      );
    case "select":
      return (
        value === "" || field.options.some((option) => option.value === value)
      );
    case "photo":
      return (
        Array.isArray(value) &&
        value.length <= (field.maxPhotos ?? 30) &&
        value.every((url) => {
          if (typeof url !== "string" || url.length > 2048) return false;
          try {
            const parsed = new URL(url);
            return (
              parsed.protocol === "https:" &&
              parsed.pathname.startsWith("/files/truck-check-images/")
            );
          } catch {
            return false;
          }
        })
      );
  }
}

export async function applyCheckMutation({
  id,
  userId,
  contributor,
  mutation,
  legacy = false,
  publish = publishCheckEvent,
}: {
  id: string;
  userId: string;
  contributor: { first_name: string; last_name: string };
  mutation: FieldMutation;
  legacy?: boolean;
  publish?: (id: string, message: Record<string, unknown>) => Promise<void>;
}) {
  const store = TruckCheckStore.make();
  const check = await store.getTruckCheck(id);
  const schemas = TruckCheckSchemaStore.make();
  const schema =
    check.schema_id && check.schema_created_at
      ? await schemas.getSchemaVersion(check.schema_id, check.schema_created_at)
      : await schemas.getSchema((await schemas.getTruck(check.truck)).schemaId);
  const field = schema.sections
    .flatMap((section) =>
      section.fields.map((field) => ({
        id: getFieldId(section.id, field.label),
        field,
      })),
    )
    .find((field) => field.id === mutation.fieldId)?.field;
  if (
    !field ||
    !validFieldValue(field, mutation.value) ||
    Buffer.byteLength(JSON.stringify(mutation)) > 24_000
  ) {
    throw new InvalidFieldMutation(
      "This field value cannot be saved. Review the pending change.",
    );
  }
  const result = await store.applyFieldMutation({
    fieldId: mutation.fieldId,
    value: mutation.value,
    clientId: mutation.clientId,
    sequence: mutation.sequence,
    id,
    userId,
    contributor,
    legacy,
  });
  if (!result.duplicate) {
    try {
      await publish(id, {
        type: "field-update",
        truckCheckId: id,
        revision: result.check.revision,
        fieldId: mutation.fieldId,
        value: mutation.value,
        updatedBy: userId,
        updatedByName:
          `${contributor.first_name} ${contributor.last_name}`.trim(),
      });
      if (!result.previous.contributors?.[userId]) {
        await publish(id, {
          type: "contributors-updated",
          truckCheckId: id,
          revision: result.check.revision,
          contributors: Object.entries(result.check.contributors).map(
            ([userId, name]) => ({
              userId,
              userName: `${name.first_name} ${name.last_name}`.trim(),
            }),
          ),
        });
      }
      const cache = new Map([
        [
          check.schema_id && check.schema_created_at
            ? `${check.schema_id}:${check.schema_created_at}`
            : `${schema.schemaId}:latest`,
          schema,
        ],
      ]);
      const previous = await calculateCompletion({
        check: result.previous,
        trucks: [],
        schemaStore: schemas,
        cache,
        completedPercent: 1,
      });
      const current = await calculateCompletion({
        check: result.check,
        trucks: [],
        schemaStore: schemas,
        cache,
        completedPercent: 1,
      });
      if (!previous.isComplete && current.isComplete) {
        await publish(id, {
          type: "truck-check-completed",
          truckCheckId: id,
          revision: result.check.revision,
          eventId: `${id}:${result.check.revision}`,
          completedByUserId: userId,
          completedByName:
            `${contributor.first_name} ${contributor.last_name}`.trim(),
        });
      }
    } catch (error) {
      log.warn("truck_check_notification_failed", {
        checkId: id,
        revision: result.check.revision,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  log.info("truck_check_mutation", {
    checkId: id,
    clientId: mutation.clientId,
    sequence: mutation.sequence,
    revision: result.check.revision,
    duplicate: result.duplicate,
  });
  return {
    snapshot: toSnapshot(result.check, userId),
    acknowledged: { clientId: mutation.clientId, sequence: mutation.sequence },
    duplicate: result.duplicate,
  };
}
