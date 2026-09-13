import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import dayjs from "dayjs";
import { setupDynamo, teardownDynamo } from "../dynamo-local";
import { DYNALITE_ENDPOINT } from "../dynalite-endpont";
import {
  TruckCheckStore,
  TruckCheckNotFound,
  TruckCheckLockNotPermitted,
  type TruckCheck,
  type DocumentTruckCheck,
} from "./truck-check-store";

function contributors(...userIds: string[]) {
  return Object.fromEntries(
    userIds.map((userId) => [
      userId,
      { first_name: userId, last_name: "Contributor" },
    ]),
  );
}

describe("truck check store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("merges concurrent mutations and does not reapply a retry after another user edits", async () => {
    const store = TruckCheckStore.make();
    const check = await store.createTruckCheck({
      created_by: "a",
      truck: "Medic",
      data: {},
      contributors: {},
      locked: false,
    });
    const mutation = (
      userId: string,
      fieldId: string,
      value: unknown,
      sequence = 1,
    ) => ({
      id: check.id,
      userId,
      fieldId,
      value,
      clientId: `${userId}-client`,
      sequence,
      contributor: { first_name: userId, last_name: "Test" },
    });
    await Promise.all([
      store.applyFieldMutation(mutation("a", "oxygen", true)),
      store.applyFieldMutation(mutation("b", "fuel", "full")),
      store.applyFieldMutation(mutation("c", "tires", true)),
    ]);
    const saved = await store.getTruckCheck(check.id);
    expect(saved.data).toEqual({ oxygen: true, fuel: "full", tires: true });
    expect(saved.revision).toBe(3);
    expect(Object.keys(saved.contributors).sort()).toEqual(["a", "b", "c"]);
    await store.applyFieldMutation(mutation("b", "oxygen", "not-present", 2));
    const retry = await store.applyFieldMutation(mutation("a", "oxygen", true));
    expect(retry.duplicate).toBe(true);
    expect(retry.check.data.oxygen).toBe("not-present");
    expect(retry.check.revision).toBe(4);
    await store.lockTruckCheck({ id: check.id, userId: "a" });
    expect(
      (await store.applyFieldMutation(mutation("a", "oxygen", true))).duplicate,
    ).toBe(true);
    await expect(
      store.applyFieldMutation(mutation("a", "oxygen", null, 2)),
    ).rejects.toThrow("locked");
    await expect(
      store.updateTruckCheckField({
        id: check.id,
        fieldId: "fuel",
        value: "empty",
      }),
    ).rejects.toThrow("locked");
  });

  it("initializes legacy mutation metadata and rejects mutations on missing checks", async () => {
    const store = TruckCheckStore.make();
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        endpoint: DYNALITE_ENDPOINT,
        region: "local",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }),
    );
    await client.send(
      new PutCommand({
        TableName: "aes_truck_checks",
        Item: {
          id: "legacy",
          created_by: "a",
          truck: "Medic",
          data: {},
          locked: false,
        },
      }),
    );
    const mutation = {
      id: "legacy",
      userId: "a",
      clientId: "client",
      sequence: 1,
      fieldId: "oxygen",
      value: true,
      contributor: { first_name: "A", last_name: "Test" },
    };
    const result = await store.applyFieldMutation(mutation);
    expect(result.check.revision).toBe(1);
    expect(result.check.contributors.a.first_name).toBe("A");
    await expect(
      store.applyFieldMutation({ ...mutation, id: "missing" }),
    ).rejects.toBeInstanceOf(TruckCheckNotFound);
  });

  it("deduplicates simultaneous delivery and atomically orders a write against a lock", async () => {
    const store = TruckCheckStore.make();
    const check = await store.createTruckCheck({
      created_by: "a",
      truck: "Medic",
      data: {},
      contributors: {},
      locked: false,
    });
    const mutation = {
      id: check.id,
      userId: "a",
      clientId: "client",
      sequence: 1,
      fieldId: "oxygen",
      value: true,
      contributor: { first_name: "A", last_name: "Test" },
    };
    const duplicates = await Promise.all([
      store.applyFieldMutation(mutation),
      store.applyFieldMutation(mutation),
    ]);
    expect(duplicates.filter((result) => result.duplicate)).toHaveLength(1);
    expect((await store.getTruckCheck(check.id)).revision).toBe(1);
    const [write, lock] = await Promise.allSettled([
      store.applyFieldMutation({ ...mutation, sequence: 2, fieldId: "tires" }),
      store.lockTruckCheck({ id: check.id, userId: "a" }),
    ]);
    expect(lock.status).toBe("fulfilled");
    const locked = await store.getTruckCheck(check.id);
    expect(locked.locked).toBe(true);
    expect(locked.data.tires).toBe(
      write.status === "fulfilled" ? true : undefined,
    );
    expect(locked.revision).toBe(write.status === "fulfilled" ? 3 : 2);
    await expect(store.deleteTruckCheck(check.id)).rejects.toThrow();
    expect((await store.getTruckCheck(check.id)).locked).toBe(true);
  });

  it("rejects excessive record growth without modifying the check", async () => {
    const store = TruckCheckStore.make();
    const check = await store.createTruckCheck({
      created_by: "a",
      truck: "Medic",
      data: {},
      contributors: {},
      locked: false,
    });
    await expect(
      store.applyFieldMutation({
        id: check.id,
        userId: "a",
        clientId: "client",
        sequence: 1,
        fieldId: "notes",
        value: "x".repeat(310000),
        contributor: { first_name: "A", last_name: "Test" },
      }),
    ).rejects.toThrow("storage limit");
    expect((await store.getTruckCheck(check.id)).data).toEqual({});
  });

  it("should be able to create and get a truck check", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good" },
      contributors: contributors("user-456"),
      locked: false,
    });

    expect(truckCheck).toMatchObject({
      id: expect.any(String),
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good" },
      contributors: contributors("user-456"),
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
      contributors: contributors("user-456"),
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
      contributors: contributors("user-456"),
      locked: false,
    });

    const check2 = await store.createTruckCheck({
      created_by: "user-789",
      truck: "Ambulance 2",
      data: { oil_level: "low" },
      contributors: contributors("user-789"),
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
      contributors: contributors("user-456"),
      locked: false,
    });

    const updated = await store.updateTruckCheck({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good", fuel: "3/4" },
      contributors: contributors("user-456", "user-789"),
      locked: true,
    });

    expect(updated).toMatchObject({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full", tire_pressure: "good", fuel: "3/4" },
      contributors: contributors("user-456", "user-789"),
      locked: true,
    });

    const retrieved = await store.getTruckCheck(created.id);
    expect(retrieved.locked).toBe(true);
    expect(retrieved.contributors).toEqual(
      contributors("user-456", "user-789"),
    );
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
        contributors: {},
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
      contributors: contributors("user-456"),
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

    const check1 = await store.createTruckCheck({
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: contributors("user-123"),
      locked: false,
    });

    const check2 = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 2",
      data: { tire_pressure: "good" },
      contributors: contributors("user-456"),
      locked: true,
    });

    const check3 = await store.createTruckCheck({
      created_by: "user-789",
      truck: "Ambulance 3",
      data: { fuel: "full" },
      contributors: contributors("user-789", "user-123"),
      locked: false,
    });

    const { truckChecks } = await store.listTruckChecks();
    expect(truckChecks.length).toBe(3);
    expect(truckChecks.map((c) => c.id)).toEqual([
      check3.id,
      check2.id,
      check1.id,
    ]);
    expect(truckChecks[0].list_pk).toBe("TRUCK_CHECK");
  });

  it("should return an empty array when listing with no truck checks", async () => {
    const store = TruckCheckStore.make();

    const { truckChecks } = await store.listTruckChecks();
    expect(truckChecks).toEqual([]);
  });

  it("should preserve created_at when updating a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: contributors("user-456"),
      locked: false,
    });

    const updated = await store.updateTruckCheck({
      id: created.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "low" },
      contributors: contributors("user-456"),
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
      contributors: contributors("user-456"),
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
      contributors: contributors("user-123"),
      locked: false,
    });

    expect(truckCheck.contributors).toEqual(contributors("user-123"));

    const updated = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { initial_check: "complete", secondary_check: "complete" },
      contributors: contributors("user-123", "user-456", "user-789"),
      locked: false,
    });

    expect(updated.contributors).toEqual(
      contributors("user-123", "user-456", "user-789"),
    );
  });

  it("should handle locked status changes", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "in_progress" },
      contributors: contributors("user-456"),
      locked: false,
    });

    expect(truckCheck.locked).toBe(false);

    const locked = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "complete" },
      contributors: contributors("user-456"),
      locked: true,
    });

    expect(locked.locked).toBe(true);

    const unlocked = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "complete" },
      contributors: contributors("user-456"),
      locked: false,
    });

    expect(unlocked.locked).toBe(false);
  });

  it("should let the creator lock a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { status: "in_progress" },
      contributors: contributors("user-456"),
      locked: false,
    });

    const locked = await store.lockTruckCheck({
      id: created.id,
      userId: "user-456",
    });

    expect(locked.locked).toBe(true);
    expect(locked.created_at).toBe(created.created_at);
    expect(locked.data).toEqual({ status: "in_progress" });

    const retrieved = await store.getTruckCheck(created.id);
    expect(retrieved.locked).toBe(true);
  });

  it("should not let a non-creator lock a truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: {},
      contributors: contributors("user-456", "user-789"),
      locked: false,
    });

    await expect(
      store.lockTruckCheck({ id: created.id, userId: "user-789" }),
    ).rejects.toBeInstanceOf(TruckCheckLockNotPermitted);

    const retrieved = await store.getTruckCheck(created.id);
    expect(retrieved.locked).toBe(false);
  });

  it("should not lock an already locked truck check", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: {},
      contributors: contributors("user-456"),
      locked: true,
    });

    await expect(
      store.lockTruckCheck({ id: created.id, userId: "user-456" }),
    ).rejects.toBeInstanceOf(TruckCheckLockNotPermitted);
  });

  it("should throw TruckCheckNotFound when locking a non-existent truck check", async () => {
    const store = TruckCheckStore.make();

    await expect(
      store.lockTruckCheck({ id: "nonexistent", userId: "user-456" }),
    ).rejects.toBeInstanceOf(TruckCheckNotFound);
  });

  it("should add a contributor without touching the locked status", async () => {
    const store = TruckCheckStore.make();

    const created = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: contributors("user-456"),
      locked: false,
    });

    await store.lockTruckCheck({ id: created.id, userId: "user-456" });

    const updated = await store.addContributor({
      id: created.id,
      userId: "user-789",
      contributor: { first_name: "user-789", last_name: "Contributor" },
    });

    expect(updated.contributors).toEqual(contributors("user-456", "user-789"));
    expect(updated.locked).toBe(true);
    expect(updated.data).toEqual({ oil_level: "full" });
  });

  it("should throw TruckCheckNotFound when adding a contributor to a non-existent truck check", async () => {
    const store = TruckCheckStore.make();

    await expect(
      store.addContributor({
        id: "nonexistent",
        userId: "user-789",
        contributor: { first_name: "user-789", last_name: "Contributor" },
      }),
    ).rejects.toBeInstanceOf(TruckCheckNotFound);
  });

  it("should handle empty data objects", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-456",
      truck: "Ambulance 1",
      data: {},
      contributors: {},
      locked: false,
    });

    expect(truckCheck.data).toEqual({});
    expect(truckCheck.contributors).toEqual({});
  });

  it("should merge contributors on update", async () => {
    const store = TruckCheckStore.make();

    const truckCheck = await store.createTruckCheck({
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { initial_check: "complete" },
      contributors: contributors("user-123"),
      locked: false,
    });

    expect(truckCheck.contributors).toEqual(contributors("user-123"));

    const updated = await store.updateTruckCheck({
      id: truckCheck.id,
      created_by: "user-123",
      truck: "Ambulance 1",
      data: { initial_check: "complete", secondary_check: "complete" },
      contributors: contributors("user-456"),
      locked: false,
    });

    expect(updated.contributors).toEqual(contributors("user-123", "user-456"));
  });
});

describe("listTruckChecksInRange", () => {
  let dynamo: DynaliteServer;
  let documentClient: DynamoDBDocumentClient;

  beforeEach(async () => {
    dynamo = await setupDynamo();
    documentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        endpoint: DYNALITE_ENDPOINT,
        region: "local",
        credentials: {
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      }),
    );
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  async function createCheckAt(
    store: TruckCheckStore,
    createdAt: string,
  ): Promise<DocumentTruckCheck> {
    const id = crypto.randomUUID();
    const document: DocumentTruckCheck = {
      id,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      list_pk: "TRUCK_CHECK",
      created_by: "user-456",
      truck: "Ambulance 1",
      data: { oil_level: "full" },
      contributors: contributors("user-456"),
      locked: false,
    };

    await documentClient.send(
      new PutCommand({
        TableName: "aes_truck_checks",
        Item: document,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );

    return store.getTruckCheck(id);
  }

  it("returns only truck checks within the date range", async () => {
    const store = TruckCheckStore.make();
    const now = dayjs();
    const check1 = await createCheckAt(
      store,
      now.subtract(10, "day").toISOString(),
    );
    const check2 = await createCheckAt(
      store,
      now.subtract(2, "day").toISOString(),
    );
    const check3 = await createCheckAt(
      store,
      now.subtract(1, "day").toISOString(),
    );

    const { truckChecks } = await store.listTruckChecksInRange({
      startDate: now.subtract(3, "day").toISOString(),
      endDate: now.toISOString(),
    });

    expect(truckChecks.map((c) => c.id)).toEqual([check3.id, check2.id]);
  });

  it("returns an empty array when no truck checks fall in the range", async () => {
    const store = TruckCheckStore.make();
    const now = dayjs();
    await createCheckAt(store, now.subtract(10, "day").toISOString());

    const { truckChecks } = await store.listTruckChecksInRange({
      startDate: now.subtract(5, "day").toISOString(),
      endDate: now.toISOString(),
    });

    expect(truckChecks).toEqual([]);
  });

  it("returns all truck checks and sorts by created_at descending", async () => {
    const store = TruckCheckStore.make();
    const now = dayjs();
    const check1 = await createCheckAt(
      store,
      now.subtract(10, "day").toISOString(),
    );
    const check2 = await createCheckAt(
      store,
      now.subtract(2, "day").toISOString(),
    );
    const check3 = await createCheckAt(
      store,
      now.subtract(1, "day").toISOString(),
    );

    const { truckChecks } = await store.listTruckChecksInRange({
      startDate: now.subtract(15, "day").toISOString(),
      endDate: now.toISOString(),
    });

    expect(truckChecks.map((c) => c.id)).toEqual([
      check3.id,
      check2.id,
      check1.id,
    ]);
  });

  it("paginates through results using lastEvaluatedKey", async () => {
    const store = TruckCheckStore.make();
    const now = dayjs();
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      const check = await createCheckAt(
        store,
        now.subtract(i, "minute").toISOString(),
      );
      ids.push(check.id);
    }

    const firstPage = await store.listTruckChecksInRange({
      startDate: now.subtract(200, "minute").toISOString(),
      endDate: now.toISOString(),
    });
    expect(firstPage.truckChecks.length).toBe(100);
    expect(firstPage.lastEvaluatedKey).toBeDefined();

    const secondPage = await store.listTruckChecksInRange({
      startDate: now.subtract(200, "minute").toISOString(),
      endDate: now.toISOString(),
      lastEvaluatedKey: firstPage.lastEvaluatedKey,
    });
    expect(secondPage.truckChecks.length).toBe(1);
    expect(secondPage.lastEvaluatedKey).toBeUndefined();

    const allIds = [
      ...firstPage.truckChecks.map((c) => c.id),
      ...secondPage.truckChecks.map((c) => c.id),
    ];
    expect(allIds.sort()).toEqual(ids.sort());
  });
});
