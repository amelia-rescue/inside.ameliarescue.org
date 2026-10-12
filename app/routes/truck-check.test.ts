import { afterEach, beforeEach, expect, it } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "~/lib/dynamo-local";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { loader } from "./truck-check";

let dynamo: DynaliteServer;
const context = {
  get: () => ({
    user: { user_id: "user-1", first_name: "Test", last_name: "User" },
    timeZone: "UTC",
  }),
} as any;

function load(url: string) {
  return loader({ context, params: {}, request: new Request(url) } as any);
}

beforeEach(async () => {
  dynamo = await setupDynamo();
});

afterEach(async () => {
  await teardownDynamo(dynamo);
});

it("filters the log by truck and shows how long since each truck was checked", async () => {
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
  for (const [truckId, displayName] of [
    ["medic-1", "Medic 1"],
    ["medic-2", "Medic 2"],
    ["medic-3", "Medic 3"],
  ]) {
    await schemas.createTruck({
      truckId,
      displayName,
      schemaId: schema.schemaId,
    });
  }
  const medic1 = await checks.createTruckCheck({
    created_by: "user-1",
    truck: "medic-1",
    data: {},
    contributors: { "user-1": { first_name: "Test", last_name: "User" } },
    locked: false,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });
  await checks.createTruckCheck({
    created_by: "user-1",
    truck: "medic-2",
    data: {},
    contributors: {},
    locked: true,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });

  const all = await load("http://localhost/truck-check");
  expect(all.truckChecks).toHaveLength(2);
  expect(all.truckFilters).toEqual([
    {
      truckId: "medic-1",
      displayName: "Medic 1",
      age: "today",
      overdue: false,
    },
    {
      truckId: "medic-2",
      displayName: "Medic 2",
      age: "today",
      overdue: false,
    },
    { truckId: "medic-3", displayName: "Medic 3", age: null, overdue: true },
  ]);
  expect(all.truckChecks[0]).toMatchObject({
    truckName: expect.stringMatching(/^Medic [12]$/),
    time: expect.stringMatching(/^\d{2}:\d{2}$/),
  });
  const open = all.truckChecks.find((check) => check.id === medic1.id)!;
  expect(open.crew).toBe("T. User");
  expect(open.locksInHours).toBeGreaterThan(0);

  const filtered = await load("http://localhost/truck-check?truck=medic-1");
  expect(filtered.truckFilter).toBe("medic-1");
  expect(filtered.truckChecks.map((check) => check.id)).toEqual([medic1.id]);
});
