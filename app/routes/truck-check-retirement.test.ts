import { afterEach, beforeEach, expect, it } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "~/lib/dynamo-local";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { action as adminAction } from "./admin/truck-checks";
import { action as checkAction, loader as checkLoader } from "./truck-check";

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
