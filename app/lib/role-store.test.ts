import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  RoleStore,
  RoleNotFound,
  RoleAlreadyExists,
  type Role,
} from "./role-store";

describe("role store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a role", async () => {
    const store = RoleStore.make();

    const role = await store.createRole({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    expect(role).toMatchObject({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getRole("Provider");
    expect(retrieved).toMatchObject({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("should throw RoleNotFound when getting a non-existent role", async () => {
    const store = RoleStore.make();

    await expect(store.getRole("nonexistent")).rejects.toBeInstanceOf(
      RoleNotFound,
    );
  });

  it("should throw RoleAlreadyExists when creating a duplicate", async () => {
    const store = RoleStore.make();

    await store.createRole({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    await expect(
      store.createRole({
        name: "Provider",
        description: "Duplicate description",
        allowed_tracks: [],
      }),
    ).rejects.toBeInstanceOf(RoleAlreadyExists);
  });

  it("should be able to update a role", async () => {
    const store = RoleStore.make();

    await store.createRole({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    const updated = await store.updateRole({
      name: "Provider",
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic", "advanced"],
    });

    expect(updated).toMatchObject({
      name: "Provider",
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic", "advanced"],
    });

    const retrieved = await store.getRole("Provider");
    expect(retrieved.description).toBe("Updated description");
    expect(retrieved.allowed_tracks).toEqual(["emt", "paramedic", "advanced"]);
  });

  it("should throw RoleNotFound when updating a non-existent role", async () => {
    const store = RoleStore.make();

    await expect(
      store.updateRole({
        name: "Nonexistent",
        description: "Test",
        allowed_tracks: [],
      }),
    ).rejects.toBeInstanceOf(RoleNotFound);
  });

  it("should be able to delete a role", async () => {
    const store = RoleStore.make();

    await store.createRole({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    await store.deleteRole("Provider");

    await expect(store.getRole("Provider")).rejects.toBeInstanceOf(
      RoleNotFound,
    );
  });

  it("should throw RoleNotFound when deleting a non-existent role", async () => {
    const store = RoleStore.make();

    await expect(store.deleteRole("nonexistent")).rejects.toBeInstanceOf(
      RoleNotFound,
    );
  });

  it("should be able to list all roles", async () => {
    const store = RoleStore.make();

    const rolesToCreate: Role[] = [
      {
        name: "Provider",
        description: "Medical care provider on ambulance",
        allowed_tracks: ["emt", "paramedic"],
      },
      {
        name: "Driver",
        description: "Ambulance driver",
        allowed_tracks: ["driver_basic"],
      },
      {
        name: "Junior",
        description: "Junior member in training",
        allowed_tracks: ["emt"],
      },
    ];

    await Promise.all(rolesToCreate.map((role) => store.createRole(role)));

    const roles = await store.listRoles();
    expect(roles.length).toBe(3);
    expect(roles.map((r) => r.name).sort()).toEqual([
      "Driver",
      "Junior",
      "Provider",
    ]);
  });

  it("should return an empty array when listing with no roles", async () => {
    const store = RoleStore.make();

    const roles = await store.listRoles();
    expect(roles).toEqual([]);
  });

  it("should preserve created_at when updating a role", async () => {
    const store = RoleStore.make();

    const created = await store.createRole({
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    const updated = await store.updateRole({
      name: "Provider",
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic"],
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });
});
