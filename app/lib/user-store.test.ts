import { describe, it, expect, beforeEach, afterEach } from "vitest";
import dynalite, { type DynaliteServer } from "dynalite";
import { UserStore } from "./user-store";
import { DYNALITE_ENDPOINT, setupDynamo, teardownDynamo } from "./util";

describe("user store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo({
      tableName: "aes_users",
    });
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
    UserStore.reset();
  });

  it("should be able to create and get a user", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    await store.createUser({
      id: "test-user",
      name: "Test User",
      email: "test@example.com",
    });
    const user = await store.getUser("test-user");
    expect(user.id).toBe("test-user");
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
  });

  it("should be able to create and get a user 2", async () => {
    const store = UserStore.make(DYNALITE_ENDPOINT);

    await store.createUser({
      id: "test-user",
      name: "Test User",
      email: "test@example.com",
    });
    const user = await store.getUser("test-user");
    expect(user.id).toBe("test-user");
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
  });
});
