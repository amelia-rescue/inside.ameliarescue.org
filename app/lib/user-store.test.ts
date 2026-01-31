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

    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
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
});
