import { beforeEach, describe, expect, it, vi } from "vitest";

// Every successful change to a user writes one `user_audit` log line naming
// who made it; failed or refused changes write none.

const store = {
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  softDelete: vi.fn(),
  restoreUser: vi.fn(),
  deletePermanently: vi.fn(),
  setTemporaryPassword: vi.fn(),
};

vi.mock("~/lib/user-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/user-store")>()),
  UserStore: { make: () => store },
}));

vi.mock("~/lib/email-service", () => ({
  EmailService: {
    make: () => ({ sendTemporaryPasswordEmail: vi.fn() }),
  },
}));

const info = vi.fn();
vi.mock("~/lib/logger", () => ({
  log: { info, warn: vi.fn(), error: vi.fn() },
}));

const { EmailInUse } = await import("~/lib/user-store");
const { action: usersAction } = await import("./users");
const { action: createUserAction } = await import("./create-user");
const { action: updateUserAction } = await import("./update-user");

const caller = {
  user_id: "admin-1",
  email: "rachel@example.com",
  first_name: "Rachel",
  last_name: "Broadt",
  website_role: "admin",
};
const context = { get: () => ({ user: caller, timeZone: "UTC" }) } as any;
const expectedActor = {
  user_id: "admin-1",
  email: "rachel@example.com",
  name: "Rachel Broadt",
  website_role: "admin",
};

const member = {
  user_id: "member-1",
  email: "marvin@example.com",
  first_name: "Marvin",
  last_name: "James",
  website_role: "user",
  membership_roles: [
    { role_name: "Provider", track_name: "EMT", precepting: false },
  ],
};

function post(fields: Record<string, string>) {
  return new Request("http://localhost/admin", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

function auditCalls() {
  return info.mock.calls
    .filter(([message]) => message === "user_audit")
    .map(([, payload]) => payload);
}

const memberForm = {
  email: "Marvin@example.com",
  first_name: "Marvin",
  last_name: "James",
  website_role: "user",
  role_name: "Provider",
  track_name: "EMT",
  precepting: "false",
  note: "",
};

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  info.mockReset();
});

describe("user audit log", () => {
  it("records who created a user", async () => {
    store.createUser.mockResolvedValue({
      ...member,
      created_at: "",
      updated_at: "",
    });
    await createUserAction({
      context,
      params: {},
      request: post(memberForm),
    } as any).catch((r) => r);
    expect(auditCalls()).toEqual([
      {
        action: "user_created",
        actor: expectedActor,
        target: {
          user_id: "member-1",
          email: "marvin@example.com",
          name: "Marvin James",
        },
        changes: {
          website_role: { from: null, to: "user" },
          membership_roles: { from: null, to: member.membership_roles },
        },
      },
    ]);
  });

  it("logs nothing when creating fails", async () => {
    store.createUser.mockRejectedValue(new EmailInUse(member as any));
    await createUserAction({
      context,
      params: {},
      request: post(memberForm),
    } as any);
    expect(auditCalls()).toEqual([]);
  });

  it("records who updated a user and what changed", async () => {
    store.getUser.mockResolvedValue(member);
    await updateUserAction({
      context,
      params: { user_id: "member-1" },
      request: post({ ...memberForm, website_role: "admin", note: "Lt." }),
    } as any);
    expect(auditCalls()).toEqual([
      expect.objectContaining({
        action: "user_updated",
        actor: expectedActor,
        target: expect.objectContaining({ user_id: "member-1" }),
        changes: {
          website_role: { from: "user", to: "admin" },
          note: { changed: true },
        },
      }),
    ]);
  });

  it("records deletes, restores, permanent deletes, and password resets", async () => {
    const deleted = { ...member, deleted_at: "2026-01-01T00:00:00.000Z" };
    store.getUser.mockResolvedValue(deleted);
    const reset = {
      user: member,
      temporaryPassword: "x",
      temporaryPasswordExpiresAt: "2027-01-01T00:00:00.000Z",
    };
    store.restoreUser.mockResolvedValue(reset);
    store.setTemporaryPassword.mockResolvedValue(reset);

    await usersAction({
      context,
      params: {},
      request: post({ intent: "delete", userId: "member-1" }),
    } as any);
    await usersAction({
      context,
      params: {},
      request: post({ intent: "restore", userId: "member-1" }),
    } as any);
    await usersAction({
      context,
      params: {},
      request: post({ intent: "set-temporary-password", userId: "member-1" }),
    } as any);
    const rootContext = {
      get: () => ({
        user: { ...caller, website_role: "root" },
        timeZone: "UTC",
      }),
    } as any;
    await usersAction({
      context: rootContext,
      params: {},
      request: post({
        intent: "delete-permanently",
        userId: "member-1",
        confirmEmail: "marvin@example.com",
      }),
    } as any);

    expect(
      auditCalls().map((c: any) => [
        c.action,
        c.actor.user_id,
        c.target.user_id,
      ]),
    ).toEqual([
      ["user_deleted", "admin-1", "member-1"],
      ["user_restored", "admin-1", "member-1"],
      ["user_temporary_password_set", "admin-1", "member-1"],
      ["user_deleted_permanently", "admin-1", "member-1"],
    ]);
  });
});
