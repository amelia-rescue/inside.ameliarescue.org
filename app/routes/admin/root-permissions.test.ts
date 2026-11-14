import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  softDelete: vi.fn(),
  restoreUser: vi.fn(),
  deletePermanently: vi.fn(),
};

vi.mock("~/lib/user-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/user-store")>()),
  UserStore: { make: () => store },
}));

const sendTemporaryPasswordEmail = vi.fn();
vi.mock("~/lib/email-service", () => ({
  EmailService: { make: () => ({ sendTemporaryPasswordEmail }) },
}));

const { EmailInUse } = await import("~/lib/user-store");
const { action: usersAction } = await import("./users");
const { action: createUserAction } = await import("./create-user");
const { action: updateUserAction } = await import("./update-user");

type Role = "user" | "admin" | "root";

function contextFor(website_role: Role) {
  return {
    get: () => ({
      user: { user_id: "caller", website_role },
      timeZone: "UTC",
    }),
  } as any;
}

function post(fields: Record<string, string>) {
  return new Request("http://localhost/admin/users", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

const deletedMember = {
  user_id: "member-1",
  email: "pat@example.com",
  first_name: "Pat",
  last_name: "Member",
  website_role: "user",
  membership_roles: [],
  deleted_at: "2026-01-01T00:00:00.000Z",
};

async function statusOf(result: Promise<unknown>) {
  try {
    const value: any = await result;
    return value?.init?.status ?? 200;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status;
    throw thrown;
  }
}

function runUsers(role: Role, fields: Record<string, string>) {
  return usersAction({
    context: contextFor(role),
    params: {},
    request: post(fields),
  } as any);
}

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  sendTemporaryPasswordEmail.mockReset();
});

describe("restore", () => {
  it("lets admins restore a deleted user and emails them", async () => {
    store.restoreUser.mockResolvedValue({
      user: deletedMember,
      temporaryPassword: "abcdefghij",
      temporaryPasswordExpiresAt: "2027-01-01T00:00:00.000Z",
    });

    const result: any = await runUsers("admin", {
      intent: "restore",
      userId: "member-1",
    });

    expect(result.data).toMatchObject({ success: true, intent: "restore" });
    expect(sendTemporaryPasswordEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "restored" }),
    );
  });

  it("explains when the member was re-onboarded", async () => {
    store.restoreUser.mockRejectedValue(
      new EmailInUse({ ...deletedMember, user_id: "member-2" } as any),
    );

    const result: any = await runUsers("admin", {
      intent: "restore",
      userId: "member-1",
    });

    expect(result.init.status).toBe(409);
    expect(result.data.error).toMatch(/re-onboarded/);
    expect(sendTemporaryPasswordEmail).not.toHaveBeenCalled();
  });

  it("rejects non-admins", async () => {
    expect(
      await statusOf(runUsers("user", { intent: "restore", userId: "x" })),
    ).toBe(403);
    expect(store.restoreUser).not.toHaveBeenCalled();
  });
});

describe("permanent delete", () => {
  const fields = {
    intent: "delete-permanently",
    userId: "member-1",
    confirmEmail: "PAT@example.com",
  };

  it("is root only", async () => {
    store.getUser.mockResolvedValue(deletedMember);
    expect(await statusOf(runUsers("admin", fields))).toBe(403);
    expect(store.deletePermanently).not.toHaveBeenCalled();
  });

  it("lets root delete a soft-deleted user", async () => {
    store.getUser.mockResolvedValue(deletedMember);
    const result: any = await runUsers("root", fields);
    expect(result.data).toMatchObject({ success: true });
    expect(store.deletePermanently).toHaveBeenCalledWith("member-1");
  });

  it("requires the user to be soft-deleted first", async () => {
    store.getUser.mockResolvedValue({
      ...deletedMember,
      deleted_at: undefined,
    });
    expect(await statusOf(runUsers("root", fields))).toBe(400);
    expect(store.deletePermanently).not.toHaveBeenCalled();
  });

  it("requires the typed email to match", async () => {
    store.getUser.mockResolvedValue(deletedMember);
    expect(
      await statusOf(
        runUsers("root", { ...fields, confirmEmail: "other@example.com" }),
      ),
    ).toBe(400);
    expect(store.deletePermanently).not.toHaveBeenCalled();
  });
});

describe("root accounts", () => {
  const rootMember = {
    ...deletedMember,
    deleted_at: undefined,
    website_role: "root",
  };

  it("admins can't soft delete a root user", async () => {
    store.getUser.mockResolvedValue(rootMember);
    expect(
      await statusOf(
        runUsers("admin", { intent: "delete", userId: "member-1" }),
      ),
    ).toBe(403);
    expect(store.softDelete).not.toHaveBeenCalled();
  });

  const userForm = (website_role: Role) => ({
    email: "new@example.com",
    first_name: "New",
    last_name: "Member",
    website_role,
    role_name: "EMT",
    track_name: "Field",
    note: "",
  });

  it("admins can't create root users", async () => {
    const result = createUserAction({
      context: contextFor("admin"),
      params: {},
      request: post(userForm("root")),
    } as any);
    expect(await statusOf(result)).toBe(403);
    expect(store.createUser).not.toHaveBeenCalled();
  });

  it("non-admins can't create users at all", async () => {
    const result = createUserAction({
      context: contextFor("user"),
      params: {},
      request: post(userForm("user")),
    } as any);
    expect(await statusOf(result)).toBe(403);
    expect(store.createUser).not.toHaveBeenCalled();
  });

  it("admins can't promote someone to root", async () => {
    store.getUser.mockResolvedValue({ ...rootMember, website_role: "admin" });
    const result = updateUserAction({
      context: contextFor("admin"),
      params: { user_id: "member-1" },
      request: post(userForm("root")),
    } as any);
    expect(await statusOf(result)).toBe(403);
    expect(store.updateUser).not.toHaveBeenCalled();
  });

  it("admins can't demote a root user", async () => {
    store.getUser.mockResolvedValue(rootMember);
    const result = updateUserAction({
      context: contextFor("admin"),
      params: { user_id: "member-1" },
      request: post(userForm("admin")),
    } as any);
    expect(await statusOf(result)).toBe(403);
    expect(store.updateUser).not.toHaveBeenCalled();
  });

  it("admins can still edit a root user's other details", async () => {
    store.getUser.mockResolvedValue(rootMember);
    const result = updateUserAction({
      context: contextFor("admin"),
      params: { user_id: "member-1" },
      request: post(userForm("root")),
    } as any);
    expect(await statusOf(result)).toBe(200);
    expect(store.updateUser).toHaveBeenCalled();
  });

  it("root can grant root", async () => {
    store.getUser.mockResolvedValue({ ...rootMember, website_role: "admin" });
    const result = updateUserAction({
      context: contextFor("root"),
      params: { user_id: "member-1" },
      request: post(userForm("root")),
    } as any);
    expect(await statusOf(result)).toBe(200);
    expect(store.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ website_role: "root" }),
    );
  });
});
