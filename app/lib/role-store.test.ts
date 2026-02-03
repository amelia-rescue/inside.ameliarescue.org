import { describe, it, expect } from "vitest";
import {
  RoleStore,
  RoleNotFound,
  RoleAlreadyExists,
  type Role,
} from "./role-store";

describe("role store test", () => {

  it("should be able to create and get a role", async () => {
    const store = RoleStore.make();
    const uniqueName = `Provider-${crypto.randomUUID()}`;

    const role = await store.createRole({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    expect(role).toMatchObject({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getRole(uniqueName);
    expect(retrieved).toMatchObject({
      name: uniqueName,
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
    const uniqueName = `Provider-${crypto.randomUUID()}`;

    await store.createRole({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    await expect(
      store.createRole({
        name: uniqueName,
        description: "Duplicate description",
        allowed_tracks: [],
      }),
    ).rejects.toBeInstanceOf(RoleAlreadyExists);
  });

  it("should be able to update a role", async () => {
    const store = RoleStore.make();
    const uniqueName = `Provider-${crypto.randomUUID()}`;

    await store.createRole({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    const updated = await store.updateRole({
      name: uniqueName,
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic", "advanced"],
    });

    expect(updated).toMatchObject({
      name: uniqueName,
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic", "advanced"],
    });

    const retrieved = await store.getRole(uniqueName);
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
    const uniqueName = `Provider-${crypto.randomUUID()}`;

    await store.createRole({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    await store.deleteRole(uniqueName);

    await expect(store.getRole(uniqueName)).rejects.toBeInstanceOf(
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
    const testId = crypto.randomUUID();

    const rolesToCreate: Role[] = [
      {
        name: `Provider-${testId}`,
        description: "Medical care provider on ambulance",
        allowed_tracks: ["emt", "paramedic"],
      },
      {
        name: `Driver-${testId}`,
        description: "Ambulance driver",
        allowed_tracks: ["driver_basic"],
      },
      {
        name: `Junior-${testId}`,
        description: "Junior member in training",
        allowed_tracks: ["emt"],
      },
    ];

    await Promise.all(rolesToCreate.map((role) => store.createRole(role)));

    const roles = await store.listRoles();
    expect(roles.length).toBeGreaterThanOrEqual(3);
    const testRoles = roles.filter((r) => r.name.includes(testId));
    expect(testRoles.map((r) => r.name).sort()).toEqual([
      `Driver-${testId}`,
      `Junior-${testId}`,
      `Provider-${testId}`,
    ]);
  });



  it("should preserve created_at when updating a role", async () => {
    const store = RoleStore.make();
    const uniqueName = `Provider-${crypto.randomUUID()}`;

    const created = await store.createRole({
      name: uniqueName,
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    });

    const updated = await store.updateRole({
      name: uniqueName,
      description: "Updated description",
      allowed_tracks: ["emt", "paramedic"],
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });
});
