import { describe, expect, it } from "vitest";

import { appContext, type Context } from "~/context";
import { isAdmin, requireAdmin, requireSelfOrAdmin } from "./authorize.server";
import type { User } from "./user-store";

const MEMBER_ID = "member-1";
const ADMIN_ID = "admin-1";

const session = {
  session_id: "session-1",
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 0,
  accessTokenExpiresAt: new Date(0).toISOString(),
};

function contextFor(user_id: string, website_role: User["website_role"]) {
  const ctx: Context = {
    user: {
      ...session,
      user_id,
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
      website_role,
      membership_roles: [],
    },
    theme: "forest",
    locale: "en-US",
    timeZone: "UTC",
  };
  return { get: (_key: typeof appContext) => ctx };
}

const emptyContext = { get: (_key: typeof appContext) => null };

async function statusOf(run: () => unknown): Promise<number> {
  try {
    run();
    return 200;
  } catch (thrown) {
    if (thrown instanceof Response) {
      const body = await thrown.json();
      expect(body).toEqual({ error: "Forbidden" });
      return thrown.status;
    }
    throw thrown;
  }
}

describe("requireSelfOrAdmin", () => {
  it("allows a member acting on their own record", async () => {
    expect(
      await statusOf(() =>
        requireSelfOrAdmin(contextFor(MEMBER_ID, "user"), MEMBER_ID),
      ),
    ).toBe(200);
  });

  it("denies a member acting on someone else's record", async () => {
    expect(
      await statusOf(() =>
        requireSelfOrAdmin(contextFor(MEMBER_ID, "user"), "someone-else"),
      ),
    ).toBe(403);
  });

  it("allows an admin acting on someone else's record", async () => {
    expect(
      await statusOf(() =>
        requireSelfOrAdmin(contextFor(ADMIN_ID, "admin"), "someone-else"),
      ),
    ).toBe(200);
  });

  it("denies an unauthenticated context", async () => {
    expect(
      await statusOf(() => requireSelfOrAdmin(emptyContext, MEMBER_ID)),
    ).toBe(403);
  });

  it("returns the context so callers can read the acting user", () => {
    const ctx = requireSelfOrAdmin(contextFor(ADMIN_ID, "admin"), "other");
    expect(ctx.user.user_id).toBe(ADMIN_ID);
  });
});

describe("requireAdmin", () => {
  it("allows admins", async () => {
    expect(
      await statusOf(() => requireAdmin(contextFor(ADMIN_ID, "admin"))),
    ).toBe(200);
  });

  it("denies members, even for their own records", async () => {
    expect(
      await statusOf(() => requireAdmin(contextFor(MEMBER_ID, "user"))),
    ).toBe(403);
  });

  it("denies an unauthenticated context", async () => {
    expect(await statusOf(() => requireAdmin(emptyContext))).toBe(403);
  });
});

describe("isAdmin", () => {
  it("only treats the admin website_role as admin", () => {
    expect(isAdmin(contextFor(ADMIN_ID, "admin").get(appContext))).toBe(true);
    expect(isAdmin(contextFor(MEMBER_ID, "user").get(appContext))).toBe(false);
  });
});
