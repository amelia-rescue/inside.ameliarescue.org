import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { DynaliteServer } from "dynalite";
import { DYNALITE_ENDPOINT, setupDynamo, teardownDynamo } from "./util";

const cognitoSendSpy = vi.fn().mockResolvedValue({});
const cognitoClientCtorSpy = vi.fn().mockImplementation(() => {
  return {
    send: cognitoSendSpy,
  };
});

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  return {
    CognitoIdentityProviderClient: cognitoClientCtorSpy,
    AdminCreateUserCommand: vi.fn().mockImplementation((input) => ({ input })),
  };
});

describe("user store test", () => {
  let dynamo: DynaliteServer;
  let UserStore: typeof import("./user-store").UserStore;
  let UserNotFound: typeof import("./user-store").UserNotFound;

  beforeAll(async () => {
    process.env.COGNITO_USER_POOL_ID = "test-user-pool";
    ({ UserStore, UserNotFound } = await import("./user-store"));
  });

  beforeEach(async () => {
    cognitoSendSpy.mockClear();
    cognitoClientCtorSpy.mockClear();
    dynamo = await setupDynamo({
      tableName: "aes_users",
    });
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a user", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    const { temporary_password } = await store.createUser({
      id: "test-user",
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });

    const user = await store.getUser("test-user");
    expect(cognitoSendSpy).toHaveBeenCalledTimes(1);
    expect(cognitoSendSpy).toHaveBeenCalledWith({
      input: {
        TemporaryPassword: expect.any(String),
        Username: "test-user",
        UserPoolId: "test-user-pool",
      },
    });

    expect(user).toMatchObject({
      id: "test-user",
      created_at: expect.any(String),
      updated_at: expect.any(String),
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });

    expect((user as any).temporary_password).toBeUndefined();
    expect(temporary_password).toHaveLength(10);
  });

  it("should be able to create and get a user 2", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    await store.createUser({
      id: "test-user",
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });
    const user = await store.getUser("test-user");
    expect(user.id).toBe("test-user");
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
  });

  it("should be able to list users", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    const usersToCreate = Array.from({ length: 10 }, (_, i) => ({
      id: `test-user-${i}`,
      name: `Test User ${i}`,
      email: `test-${i}@example.com`,
      role: "user" as const,
    }));

    await Promise.all(usersToCreate.map((user) => store.createUser(user)));

    const users = await store.listUsers();
    expect(users.length).toBe(10);
  });

  it("should be able to update users", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);
    const id = crypto.randomUUID();
    await store.createUser({
      id,
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });
    await store.updateUser({
      id,
      name: "Updated User",
    });
    const user = await store.getUser(id);
    expect(user.name).toBe("Updated User");
  });

  it("should throw a UserNotFound error when trying to update a usser that does not exist", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);
    await expect(
      store.updateUser({ id: "non-existent-user", name: "Updated User" }),
    ).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should be able to soft delete users and list them out if includeDeleted is true", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    const activeId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();

    await Promise.all([
      store.createUser({
        id: activeId,
        name: "Active User",
        email: "active@example.com",
        role: "user",
      }),
      store.createUser({
        id: deletedId,
        name: "Deleted User",
        email: "deleted@example.com",
        role: "user",
      }),
    ]);

    await store.deleteUser(deletedId);

    const withoutDeleted = await store.listUsers();
    expect(withoutDeleted.map((u) => u.id)).toEqual([activeId]);

    const withDeleted = await store.listUsers(true);
    expect(withDeleted.map((u) => u.id).sort()).toEqual(
      [activeId, deletedId].sort(),
    );

    const deletedUser = withDeleted.find((u) => u.id === deletedId);
    expect(deletedUser?.deleted_at).toBeTruthy();
  });

  it("should be able to delete users permanently", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);
    const id = crypto.randomUUID();

    await store.createUser({
      id,
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });

    await store.deletePermanently(id);
    await expect(store.getUser(id)).rejects.toBeInstanceOf(UserNotFound);
  });
});
