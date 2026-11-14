import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  DeletedUserHasEmail,
  EmailInUse,
  SignInAccountConflict,
  UserNotDeleted,
  UserStore,
} from "./user-store";

type Attribute = { Name: string; Value: string };
type FakeAccount = { Username: string; Attributes: Attribute[] };

/** Just enough of Cognito for the user store's admin calls. */
function makeFakeCognito() {
  const accounts: FakeAccount[] = [];
  const emailOf = (account: FakeAccount) =>
    account.Attributes.find((a) => a.Name === "email")?.Value.toLowerCase();

  const send = vi.fn(async (command: { input: any }) => {
    const input = command.input;
    switch (command.constructor.name) {
      case "AdminCreateUserCommand": {
        const email = String(input.Username).toLowerCase();
        if (accounts.some((account) => emailOf(account) === email)) {
          throw Object.assign(new Error("User account already exists"), {
            name: "UsernameExistsException",
          });
        }
        const sub = crypto.randomUUID();
        accounts.push({
          Username: sub,
          Attributes: [...input.UserAttributes, { Name: "sub", Value: sub }],
        });
        return { User: { Username: sub } };
      }
      case "ListUsersCommand": {
        const email = /email = "(.*)"/.exec(input.Filter ?? "")?.[1];
        return {
          Users: accounts.filter(
            (account) => !email || emailOf(account) === email.toLowerCase(),
          ),
        };
      }
      case "AdminDeleteUserCommand": {
        const index = accounts.findIndex((a) => a.Username === input.Username);
        if (index >= 0) accounts.splice(index, 1);
        return {};
      }
      default:
        return {};
    }
  });

  return { client: { send } as any, send, accounts };
}

function resetUserStoreStatics() {
  const userStoreClass = UserStore as unknown as {
    client?: unknown;
    cognito?: unknown;
  };
  userStoreClass.client = undefined;
  userStoreClass.cognito = undefined;
}

const member = (email: string, first_name = "Pat") => ({
  first_name,
  last_name: "Member",
  email,
  website_role: "user" as const,
  membership_roles: [
    { role_name: "Provider", track_name: "EMT", precepting: false },
  ],
});

function commandsSent(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls.map(([command]) => command.constructor.name);
}

describe("offboarding and restoring users", () => {
  let dynamo: DynaliteServer;
  let cognito: ReturnType<typeof makeFakeCognito>;
  let store: UserStore;

  beforeEach(async () => {
    resetUserStoreStatics();
    dynamo = await setupDynamo();
    cognito = makeFakeCognito();
    store = UserStore.make({ cognito: cognito.client });
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
    resetUserStoreStatics();
  });

  /** A re-onboarded member: an active record sharing a deleted one's email. */
  async function reonboard(email: string) {
    const active = await store.createUser(member("placeholder@example.com"));
    await store.updateUser({ user_id: active.user_id, email });
    cognito.accounts.find((a) => a.Username === active.user_id)!.Attributes = [
      { Name: "email", Value: email },
      { Name: "sub", Value: active.user_id },
    ];
    return active;
  }

  describe("createUser", () => {
    it("refuses an email that belongs to a deleted user, ignoring case", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      cognito.send.mockClear();

      const attempt = store.createUser(member("Pat@Example.com"));

      await expect(attempt).rejects.toBeInstanceOf(DeletedUserHasEmail);
      await expect(attempt).rejects.toMatchObject({
        deletedUser: { user_id: original.user_id },
      });
      expect(cognito.send).not.toHaveBeenCalled();
    });

    it("refuses an email that an active user already has", async () => {
      await store.createUser(member("pat@example.com"));

      await expect(
        store.createUser(member("pat@example.com")),
      ).rejects.toBeInstanceOf(EmailInUse);
    });
  });

  describe("restoreUser", () => {
    it("brings back the same record with a sign-in account linked to it", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      expect(cognito.accounts).toHaveLength(0);
      cognito.send.mockClear();

      const restored = await store.restoreUser(original.user_id);

      expect(restored.user.user_id).toBe(original.user_id);
      expect(restored.user.deleted_at).toBeUndefined();
      expect(restored.temporaryPassword).toMatch(/^[A-Za-z]{10}$/);

      const fromDb = await store.getUser(original.user_id);
      expect(fromDb.deleted_at).toBeUndefined();
      expect(fromDb.temporary_password_expires_at).toBe(
        restored.temporaryPasswordExpiresAt,
      );

      expect(cognito.accounts).toHaveLength(1);
      expect(cognito.accounts[0].Attributes).toContainEqual({
        Name: "custom:user_id",
        Value: original.user_id,
      });
      const create = cognito.send.mock.calls.find(
        ([command]) => command.constructor.name === "AdminCreateUserCommand",
      )!;
      expect(create[0].input).toMatchObject({
        MessageAction: "SUPPRESS",
        TemporaryPassword: restored.temporaryPassword,
      });
    });

    it("can be deleted and restored again", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      await store.restoreUser(original.user_id);

      // The restored account is linked through custom:user_id, not its sub.
      await store.softDelete(original.user_id);
      expect(cognito.accounts).toHaveLength(0);

      await store.restoreUser(original.user_id);
      expect(cognito.accounts).toHaveLength(1);
    });

    it("refuses when the member was re-onboarded as a new user", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      const active = await reonboard("pat@example.com");
      cognito.send.mockClear();

      const attempt = store.restoreUser(original.user_id);

      await expect(attempt).rejects.toBeInstanceOf(EmailInUse);
      await expect(attempt).rejects.toMatchObject({
        existingUser: { user_id: active.user_id },
      });
      const stillDeleted = await store.getUser(original.user_id, {
        includeDeleted: true,
      });
      expect(stillDeleted.deleted_at).toBeTruthy();
      expect(cognito.send).not.toHaveBeenCalled();
    });

    it("refuses when the email's sign-in account belongs to another record", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      cognito.accounts.push({
        Username: "someone-else",
        Attributes: [
          { Name: "email", Value: "pat@example.com" },
          { Name: "sub", Value: "someone-else" },
        ],
      });

      await expect(store.restoreUser(original.user_id)).rejects.toBeInstanceOf(
        SignInAccountConflict,
      );
    });

    it("reuses its own sign-in account left behind by a failed delete", async () => {
      const original = await store.createUser(member("pat@example.com"));
      const leftover = [...cognito.accounts];
      await store.softDelete(original.user_id);
      cognito.accounts.push(...leftover);
      cognito.send.mockClear();

      await store.restoreUser(original.user_id);

      const sent = commandsSent(cognito.send);
      expect(sent).toContain("AdminSetUserPasswordCommand");
      expect(sent).not.toContain("AdminCreateUserCommand");
    });

    it("refuses a user who isn't deleted", async () => {
      const original = await store.createUser(member("pat@example.com"));

      await expect(store.restoreUser(original.user_id)).rejects.toBeInstanceOf(
        UserNotDeleted,
      );
    });
  });

  describe("deleting a stale duplicate record", () => {
    it("soft delete leaves the re-onboarded member able to sign in", async () => {
      const stale = await store.createUser(member("pat@example.com"));
      // Simulate the old record's sign-in account having been deleted already.
      cognito.accounts.length = 0;
      const active = await reonboard("pat@example.com");

      await store.softDelete(stale.user_id);

      expect(cognito.accounts.map((a) => a.Username)).toEqual([active.user_id]);
    });

    it("permanent delete removes only the record and its own account", async () => {
      const original = await store.createUser(member("pat@example.com"));
      await store.softDelete(original.user_id);
      const active = await reonboard("pat@example.com");

      await store.deletePermanently(original.user_id);

      await expect(
        store.getUser(original.user_id, { includeDeleted: true }),
      ).rejects.toThrow("User not found");
      expect(cognito.accounts.map((a) => a.Username)).toEqual([active.user_id]);
      expect((await store.getUser(active.user_id)).email).toBe(
        "pat@example.com",
      );
    });
  });
});
