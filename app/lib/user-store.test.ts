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
import { setupDynamo, teardownDynamo } from "./dynamo-local";

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
    const store = UserStore.make();

    const { temporary_password, user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      role: "admin",
    });

    const user = await store.getUser(user_id);
    expect(cognitoSendSpy).toHaveBeenCalledTimes(1);
    expect(cognitoSendSpy).toHaveBeenCalledWith({
      input: {
        TemporaryPassword: expect.any(String),
        Username: expect.any(String),
        UserPoolId: "test-user-pool",
      },
    });

    expect(user).toMatchObject({
      user_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      role: "admin",
    });

    expect((user as any).temporary_password).toBeUndefined();
    expect(temporary_password).toHaveLength(10);
  });

  it("should be able to create and get a user 2", async () => {
    const store = UserStore.make();

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      role: "admin",
    });
    const user = await store.getUser(user_id);
    expect(user.user_id).toBe(user_id);
    expect(user.first_name).toBe("Test");
    expect(user.last_name).toBe("User");
    expect(user.email).toBe("test@example.com");
  });

  it("should be able to list users", async () => {
    const store = UserStore.make();

    const usersToCreate = Array.from({ length: 10 }, (_, i) => ({
      first_name: "Test",
      last_name: `User${i}`,
      email: `test-${i}@example.com`,
      role: "user" as const,
    }));

    await Promise.all(usersToCreate.map((user) => store.createUser(user)));

    const users = await store.listUsers();
    expect(users.length).toBe(10);
  });

  it("should be able to update users", async () => {
    const store = UserStore.make();
    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      role: "admin",
    });
    await store.updateUser({
      user_id,
      first_name: "Updated",
      last_name: "User",
    });
    const user = await store.getUser(user_id);
    expect(user.first_name).toBe("Updated");
  });

  it("should throw a UserNotFound error when trying to update a usser that does not exist", async () => {
    const store = UserStore.make();
    await expect(
      store.updateUser({
        user_id: "non-existent-user",
        first_name: "Updated",
        last_name: "User",
      }),
    ).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should be able to soft delete users and list them out if includeDeleted is true", async () => {
    const store = UserStore.make();

    const activeId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();

    const [activeUser, deletedUser] = await Promise.all([
      store.createUser({
        first_name: "Active",
        last_name: "User",
        email: "active@example.com",
        role: "user",
      }),
      store.createUser({
        first_name: "Deleted",
        last_name: "User",
        email: "deleted@example.com",
        role: "user",
      }),
    ]);
    const actualActiveId = activeUser.user_id;
    const actualDeletedId = deletedUser.user_id;

    await store.deleteUser(actualDeletedId);

    const withoutDeleted = await store.listUsers();
    expect(withoutDeleted.map((u) => u.user_id)).toEqual([actualActiveId]);

    const withDeleted = await store.listUsers(true);
    expect(withDeleted.map((u) => u.user_id).sort()).toEqual(
      [actualActiveId, actualDeletedId].sort(),
    );

    const deletedUserFromList = withDeleted.find(
      (u) => u.user_id === actualDeletedId,
    );
    expect(deletedUserFromList?.deleted_at).toBeTruthy();
  });

  it("should be able to delete users permanently", async () => {
    const store = UserStore.make();

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      role: "admin",
    });

    await store.deletePermanently(user_id);
    await expect(store.getUser(user_id)).rejects.toBeInstanceOf(UserNotFound);
  });
});
