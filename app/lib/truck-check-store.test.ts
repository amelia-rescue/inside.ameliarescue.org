import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  TruckCheckStore,
  TruckCheckNotFound,
  type TruckCheck,
} from "./truck-check-store";

describe("truck check store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a truck check", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good" },
      contributors: ["user-456"],
      locked: false,
    });

    expect(truckCheck).toMatchObject({
      id: expect.any(String),
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good" },
      contributors: ["user-456"],
      locked: false,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getTruckCheck(truckCheck.id);
    expect(retrieved).toMatchObject({
      id: truckCheck.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good" },
      contributors: ["user-456"],
      locked: false,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("should throw TruckCheckNotFound when getting a non-existent truck check", async () => {
    const store = TruckCheckStore.make();

    await expect(store.getTruckCheck("nonexistent")).rejects.toBeInstanceOf(
      TruckCheckNotFound,
    );
  });

  it("should generate unique IDs for each truck check", async () => {
    const store = TruckCheckStore.make();

    const check1 = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: ["user-456"],
      locked: false,
    });

    const check2 = await store.createTruckCheck({
      created_by: "user-789",
      truck: "Ambulance 2",
      data: { oil_level: "low" },
      contributors: ["user-789"],
      locked: false,
    });

    expect(check1.id).not.toBe(check2.id);
    expect(check1.id).toBeTruthy();
    expect(check2.id).toBeTruthy();
  });

  it("should be able to update a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: ["user-456"],
      locked: false,
    });

    const updated = await store.updateTruckCheck({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good", fuel: "3/4" },
      contributors: ["user-456", "user-789"],
      locked: true,
    });

    expect(updated).toMatchObject({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good", fuel: "3/4" },
      contributors: ["user-456", "user-789"],
      locked: true,
    });

    const retrieved = await store.getTruckCheck(created.id);
    expect(retrieved.locked).toBe(true);
    expect(retrieved.contributors).toEqual(["user-456", "user-789"]);
    expect(retrieved.data).toEqual({
      oil_level: "full",
      tire_pressure: "good",
      fuel: "3/4",
    });
  });

  it("should throw TruckCheckNotFound when updating a non-existent truck check", async () => {
    const store = TruckCheckStore.make();

    await expect(
      store.updateTruckCheck({
        id: "nonexistent",
        created_by: "user-456",
        truck: "Ambulance 1",
        data: {},
        contributors: [],
        locked: false,
      }),
    ).rejects.toBeInstanceOf(TruckCheckNotFound);
  });

  it("should be able to delete a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: ["user-456"],
      locked: false,
    });

    await store.deleteTruckCheck(created.id);

    await expect(store.getTruckCheck(created.id)).rejects.toBeInstanceOf(
      TruckCheckNotFound,
    );
  });

  it("should throw TruckCheckNotFound when deleting a non-existent truck check", async () => {
    const store = TruckCheckStore.make();

    await expect(store.deleteTruckCheck("nonexistent")).rejects.toBeInstanceOf(
      TruckCheckNotFound,
    );
  });

  it("should be able to list all truck checks", async () => {
    const store = TruckCheckStore.make();

    const checksToCreate: Omit<TruckCheck, "id">[] = [
      {
        created_by: "user-123",
        truck: "Ambulance 1",
        data: { oil_level: "full" },
        contributors: ["user-123"],
        locked: false,
      },
      {
        created_by: "user-456",
        truck: "Ambulance 2",
        data: { tire_pressure: "good" },
        contributors: ["user-456"],
        locked: true,
      },
      {
        created_by: "user-789",
        truck: "Ambulance 3",
        data: { fuel: "full" },
        contributors: ["user-789", "user-123"],
        locked: false,
      },
    ];

    await Promise.all(
      checksToCreate.map((check) => store.createTruckCheck(check)),
    );

    const checks = await store.listTruckChecks();
    expect(checks.length).toBe(3);
  });

  it("should return an empty array when listing with no truck checks", async () => {
    const store = TruckCheckStore.make();

    const checks = await store.listTruckChecks();
    expect(checks).toEqual([]);
  });

  it("should preserve created_at when updating a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: ["user-456"],
      locked: false,
    });

    const updated = await store.updateTruckCheck({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "low" },
      contributors: ["user-456"],
      locked: true,
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("should handle truck checks with complex data objects", async () => {
    const store = TruckCheckStore.make();

    const complexData = {
      fluids: {
        oil: "full",
        coolant: "good",
        windshield_washer: "low",
      },
      tires: {
        front_left: "35psi",
        front_right: "35psi",
        rear_left: "40psi",
        rear_right: "40psi",
      },
      equipment: {
        oxygen_tanks: 2,
        stretcher: "functional",
        defibrillator: "charged",
      },
      notes: "All systems operational",
    };

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: complexData,
      contributors: ["user-456"],
      locked: false,
    });

    expect(truckCheck.data).toEqual(complexData);

    const retrieved = await store.getTruckCheck(truckCheck.id);
    expect(retrieved.data).toEqual(complexData);
  });

  it("should handle multiple contributors", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { initial_check: "complete" },
      contributors: ["user-123"],
      locked: false,
    });

    expect(truckCheck.contributors).toEqual(["user-123"]);

    const updated = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { initial_check: "complete", secondary_check: "complete" },
      contributors: ["user-123", "user-456", "user-789"],
      locked: false,
    });

    expect(updated.contributors).toEqual(["user-123", "user-456", "user-789"]);
  });

  it("should handle locked status changes", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "in_progress" },
      contributors: ["user-456"],
      locked: false,
    });

    expect(truckCheck.locked).toBe(false);

    const locked = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "complete" },
      contributors: ["user-456"],
      locked: true,
    });

    expect(locked.locked).toBe(true);

    const unlocked = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "complete" },
      contributors: ["user-456"],
      locked: false,
    });

    expect(unlocked.locked).toBe(false);
  });

  it("should handle empty data objects", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: {},
      contributors: [],
      locked: false,
    });

    expect(truckCheck.data).toEqual({});
    expect(truckCheck.contributors).toEqual([]);
  });
});
