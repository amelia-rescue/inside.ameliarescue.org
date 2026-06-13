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
import { UserNotFound, UserStore } from "./user-store";

function resetUserStoreStatics() {
  const userStoreClass = UserStore as unknown as {
    client?: unknown;
    cognito?: unknown;
  };
  userStoreClass.client = undefined;
  userStoreClass.cognito = undefined;
}

describe("user store test", () => {
  let dynamo: DynaliteServer;
  let mockCognitoClient: any;
  let cognitoSendSpy: any;

  beforeEach(async () => {
    cognitoSendSpy = vi.fn().mockImplementation(async () => {
      return {
        User: {
          Username: crypto.randomUUID(),
        },
      };
    });

    mockCognitoClient = {
      send: cognitoSendSpy,
    };

    resetUserStoreStatics();
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
    resetUserStoreStatics();
  });

  it("should be able to create and get a user", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    const user = await store.getUser(user_id);
    expect(cognitoSendSpy).toHaveBeenCalledTimes(1);
    expect(cognitoSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TemporaryPassword: expect.any(String),
          Username: "test@example.com",
          UserPoolId: "inside-amelia-rescue-users",
          UserAttributes: [
            {
              Name: "email",
              Value: "test@example.com",
            },
            {
              Name: "given_name",
              Value: "Test",
            },
            {
              Name: "family_name",
              Value: "User",
            },
          ],
        },
      }),
    );

    expect(user).toMatchObject({
      user_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
    });
  });

  it("should be able to create and get a user 2", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });
    const user = await store.getUser(user_id);
    expect(user.user_id).toBe(user_id);
    expect(user.first_name).toBe("Test");
    expect(user.last_name).toBe("User");
    expect(user.email).toBe("test@example.com");
  });

  it("should be able to list users", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const usersToCreate = Array.from({ length: 10 }, (_, i) => ({
      first_name: `Test ${i}`,
      last_name: "User",
      email: `test${i}@example.com`,
      website_role: "user" as const,
      membership_roles: [
        { role_name: "Junior", track_name: "EMT", precepting: true },
      ],
    }));

    await Promise.all(usersToCreate.map((user) => store.createUser(user)));

    const users = await store.listUsers();
    expect(users.length).toBe(10);
  });

  it("should be able to update users", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });
    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });
    await store.updateUser({
      user_id,
      first_name: "Updated",
      last_name: "User",
    });
    const user = await store.getUser(user_id);
    expect(user.first_name).toBe("Updated");
  });

  it("should set a temporary password for an existing user", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });
    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    cognitoSendSpy.mockClear();

    const result = await store.setTemporaryPassword(user_id);

    expect(result.user.user_id).toBe(user_id);
    expect(result.temporaryPassword).toHaveLength(10);
    expect(cognitoSendSpy).toHaveBeenCalledTimes(1);
    expect(cognitoSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Password: result.temporaryPassword,
          Permanent: false,
          Username: user_id,
          UserPoolId: "inside-amelia-rescue-users",
        },
      }),
    );
  });

  it("should throw UserNotFound when setting a temporary password for a missing user", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    await expect(
      store.setTemporaryPassword("non-existent-user"),
    ).rejects.toBeInstanceOf(UserNotFound);
    expect(cognitoSendSpy).not.toHaveBeenCalled();
  });

  it("should throw a UserNotFound error when trying to update a usser that does not exist", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });
    await expect(
      store.updateUser({
        user_id: "non-existent-user",
        first_name: "Updated",
        last_name: "User",
      }),
    ).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should be able to soft delete users and list them out if includeDeleted is true", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const activeId = crypto.randomUUID();
    const deletedId = crypto.randomUUID();

    const [activeUser, deletedUser] = await Promise.all([
      store.createUser({
        first_name: "Active",
        last_name: "User",
        email: "active@example.com",
        website_role: "user",
        membership_roles: [
          { role_name: "Junior", track_name: "EMT", precepting: false },
        ],
      }),
      store.createUser({
        first_name: "Deleted",
        last_name: "User",
        email: "deleted@example.com",
        website_role: "user",
        membership_roles: [
          { role_name: "Junior", track_name: "EMT", precepting: false },
        ],
      }),
    ]);
    const actualActiveId = activeUser.user_id;
    const actualDeletedId = deletedUser.user_id;

    await store.softDelete(actualDeletedId);

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

  it("should throw UserNotFound when getting a soft-deleted user", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    await store.softDelete(user_id);
    await expect(store.getUser(user_id)).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should get a soft-deleted user when includeDeleted is true", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    await store.softDelete(user_id);

    const user = await store.getUser(user_id, { includeDeleted: true });
    expect(user.user_id).toBe(user_id);
    expect(user.deleted_at).toBeTruthy();
  });

  it("should be able to hard delete users permanently", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    await store.deletePermanently(user_id);
    await expect(store.getUser(user_id)).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should be able to get a user by email", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id, email } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "lookup@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    const user = await store.getByEmail(email);
    expect(user.user_id).toBe(user_id);
    expect(user.email).toBe("lookup@example.com");
    expect(user.first_name).toBe("Test");
    expect(user.last_name).toBe("User");
  });

  it("should throw UserNotFound when getting by email that does not exist", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    await expect(
      store.getByEmail("nonexistent@example.com"),
    ).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should throw UserNotFound when getting a soft-deleted user by email", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    const { user_id, email } = await store.createUser({
      first_name: "Test",
      last_name: "User",
      email: "deleted@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    await store.softDelete(user_id);
    await expect(store.getByEmail(email)).rejects.toBeInstanceOf(UserNotFound);
  });

  it("should find active user when both deleted and active users share the same email", async () => {
    const store = UserStore.make({ cognito: mockCognitoClient });

    // Create and delete first user
    const deletedUser = await store.createUser({
      first_name: "Deleted",
      last_name: "User",
      email: "shared@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Junior", track_name: "EMT", precepting: false },
      ],
    });
    await store.softDelete(deletedUser.user_id);

    // Create new active user with same email (new cognito mock response)
    cognitoSendSpy.mockResolvedValueOnce({
      User: { Username: crypto.randomUUID() },
    });
    const activeUser = await store.createUser({
      first_name: "Active",
      last_name: "User",
      email: "shared@example.com",
      website_role: "admin",
      membership_roles: [
        { role_name: "Provider", track_name: "EMT", precepting: false },
      ],
    });

    // Should find the active user, not the deleted one
    const foundUser = await store.getByEmail("shared@example.com");
    expect(foundUser.user_id).toBe(activeUser.user_id);
    expect(foundUser.first_name).toBe("Active");
    expect(foundUser.deleted_at).toBeUndefined();
  });
});
