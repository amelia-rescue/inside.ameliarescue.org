import { beforeEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
vi.mock("./logger", () => ({ log: { info, warn: vi.fn(), error: vi.fn() } }));

const { diffUser, logUserAudit } = await import("./user-audit.server");

const admin = {
  user_id: "admin-1",
  email: "rachel@example.com",
  first_name: "Rachel",
  last_name: "Admin",
  website_role: "admin" as const,
};
const member = {
  user_id: "member-1",
  email: "pat@example.com",
  first_name: "Pat",
  last_name: "Member",
};

describe("diffUser", () => {
  it("reports only fields that changed, with before and after", () => {
    expect(
      diffUser(
        { ...member, website_role: "user", membership_roles: [] },
        {
          ...member,
          website_role: "admin",
          membership_roles: [
            { role_name: "Provider", track_name: "EMT", precepting: false },
          ],
        },
      ),
    ).toEqual({
      website_role: { from: "user", to: "admin" },
      membership_roles: {
        from: [],
        to: [{ role_name: "Provider", track_name: "EMT", precepting: false }],
      },
    });
  });

  it("hides the values of phone, notes, and profile picture", () => {
    expect(
      diffUser(
        { phone: "804-555-0100", note: "old" },
        {
          phone: "804-555-0199",
          note: "new",
          profile_picture_url: "https://x",
        },
      ),
    ).toEqual({
      phone: { changed: true },
      note: { changed: true },
      profile_picture_url: { changed: true },
    });
  });

  it("treats a blank form field as unchanged when it was never set", () => {
    expect(
      diffUser({ first_name: "Pat" }, { first_name: "Pat", note: "" }),
    ).toEqual({});
  });

  it("ignores ids and timestamps", () => {
    expect(
      diffUser(
        { user_id: "a", last_login_at: "x" } as any,
        { user_id: "b", last_login_at: "y" } as any,
      ),
    ).toEqual({});
  });
});

describe("logUserAudit", () => {
  beforeEach(() => info.mockClear());

  it("logs the actor and target by id, email, and name", () => {
    logUserAudit("user_updated", admin, member, {
      website_role: { from: "user", to: "admin" },
    });
    expect(info).toHaveBeenCalledWith("user_audit", {
      action: "user_updated",
      actor: {
        user_id: "admin-1",
        email: "rachel@example.com",
        name: "Rachel Admin",
        website_role: "admin",
      },
      target: {
        user_id: "member-1",
        email: "pat@example.com",
        name: "Pat Member",
      },
      changes: { website_role: { from: "user", to: "admin" } },
    });
  });

  it("omits changes when there are none to report", () => {
    logUserAudit("user_deleted", admin, member);
    expect(info.mock.calls[0][1]).not.toHaveProperty("changes");
  });
});
