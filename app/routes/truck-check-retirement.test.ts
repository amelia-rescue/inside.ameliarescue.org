import { afterEach, beforeEach, expect, it } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "~/lib/dynamo-local";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { action as adminAction } from "./admin/truck-checks";
import { action as checkAction, loader as checkLoader } from "./truck-check";
import { loader as detailLoader } from "./truck-check-dynamic";
import { calculateCompletion } from "~/lib/truck-check/completion";

let dynamo: DynaliteServer;
const context = {
  get: () => ({
    user: {
      user_id: "user-1",
      first_name: "Test",
      last_name: "User",
      website_role: "admin",
    },
  }),
} as any;

function post(fields: Record<string, string>) {
  return {
    context,
    request: new Request("http://localhost/truck-checks", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
    params: {},
  } as any;
}

beforeEach(async () => {
  dynamo = await setupDynamo();
});

afterEach(async () => {
  await teardownDynamo(dynamo);
});

it("reads historical checkbox values alongside new issue notes without changing completion or pinned schemas", async () => {
  const schemas = TruckCheckSchemaStore.make();
  const checks = TruckCheckStore.make();
  const schema = await schemas.createSchema({
    created_by: "user-1",
    version: 1,
    title: "Original checklist",
    sections: [
      {
        id: "zoll",
        title: "Zoll",
        fields: [{ type: "checkbox", label: "Electrodes", required: true }],
      },
    ],
  });
  await schemas.createTruck({
    truckId: "medic-1",
    displayName: "Medic 1",
    schemaId: schema.schemaId,
  });
  const old = await checks.createTruckCheck({
    created_by: "user-1",
    truck: "medic-1",
    data: { "zoll-electrodes": "not-present" },
    contributors: {},
    locked: true,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });
  const current = await checks.createTruckCheck({
    created_by: "user-1",
    truck: "medic-1",
    data: {},
    contributors: {},
    locked: false,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });
  await checks.applyFieldMutation({
    id: current.id,
    fieldId: "zoll-electrodes",
    value: "not-present",
    note: "Only one pack",
    userId: "user-1",
    contributor: { first_name: "Test", last_name: "User" },
    clientId: "phone",
    sequence: 1,
  });
  const args = {
    context,
    params: {},
    request: new Request("http://localhost/truck-check"),
  };
  const listing = await checkLoader(args as any);
  const oldSummary = listing.truckChecks.find((check) => check.id === old.id)!;
  const newSummary = listing.truckChecks.find(
    (check) => check.id === current.id,
  )!;
  for (const summary of [oldSummary, newSummary]) {
    expect(summary.requiredCompleted).toBe(1);
    expect(summary.problemCount).toBe(1);
    const completion = await calculateCompletion({
      check: summary,
      trucks: [],
      schemaStore: schemas,
    });
    expect(completion.isComplete).toBe(true);
  }
  expect(oldSummary.problemSections[0].fields[0]).toEqual({
    fieldId: "zoll-electrodes",
    label: "Electrodes",
  });
  expect(newSummary.problemSections[0].fields[0]).toMatchObject({
    note: "Only one pack",
    updatedBy: { userId: "user-1" },
  });
  const detail = await detailLoader({ ...args, params: { id: old.id } } as any);
  expect(detail.schema.createdAt).toBe(schema.createdAt);
  expect(detail.truckCheck.data["zoll-electrodes"]).toBe("not-present");
  expect(detail.truckCheck.field_updates).toBeUndefined();
});

it("blocks new checks for a retired truck without hiding its history, and permits reactivation", async () => {
  const schemas = TruckCheckSchemaStore.make();
  const checks = TruckCheckStore.make();
  const schema = await schemas.createSchema({
    created_by: "user-1",
    version: 1,
    title: "Checklist",
    sections: [
      {
        id: "equipment",
        title: "Equipment",
        fields: [{ type: "checkbox", label: "Oxygen", required: true }],
      },
    ],
  });
  await schemas.createTruck({
    truckId: "medic-1",
    displayName: "Medic 1",
    schemaId: schema.schemaId,
  });
  const previous = await checks.createTruckCheck({
    created_by: "user-1",
    truck: "medic-1",
    data: { "equipment-oxygen": true },
    contributors: {},
    locked: true,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });

  await adminAction(post({ intent: "retire-truck", truckId: "medic-1" }));
  await adminAction(
    post({
      intent: "update-truck",
      truckId: "medic-1",
      displayName: "Medic 1 (old)",
      schemaId: schema.schemaId,
    }),
  );
  expect((await schemas.getTruck("medic-1")).retired).toBe(true);

  const result = await checkAction(
    post({ intent: "create", truck: "medic-1" }),
  );
  expect(result).toMatchObject({
    init: { status: 400 },
    data: { error: expect.stringContaining("retired") },
  });
  const listing = await checkLoader({
    context,
    params: {},
    request: new Request("http://localhost/truck-checks"),
  } as any);
  expect(listing.trucks).toContainEqual(
    expect.objectContaining({ truckId: "medic-1", retired: true }),
  );
  expect(listing.truckChecks).toContainEqual(
    expect.objectContaining({ id: previous.id, requiredCompleted: 1 }),
  );
  expect((await checks.listTruckChecks()).truckChecks).toHaveLength(1);

  await adminAction(post({ intent: "reactivate-truck", truckId: "medic-1" }));
  const created = await checkAction(
    post({ intent: "create", truck: "medic-1" }),
  );
  expect(created).toBeInstanceOf(Response);
  expect((await checks.listTruckChecks()).truckChecks).toHaveLength(2);
});
