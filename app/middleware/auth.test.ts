import { describe, expect, it, vi } from "vitest";
import { authMiddleware } from "./auth";
import { appContext } from "~/context";

import type { SessionUser } from "~/lib/session.server";
import { UserStore, type User } from "~/lib/user-store";

vi.mock("~/lib/session.server", () => ({
  requireUser: vi.fn(),
}));

const testUser: User = {
  user_id: crypto.randomUUID(),
  email: "test@example.com",
  first_name: "Test",
  last_name: "User",
  website_role: "admin",
  membership_role: [
    { role_name: "Provider", track_id: "paramedic" },
    { role_name: "Driver", track_id: "driver_basic" },
  ],
};

vi.mock("~/lib/user-store", () => ({
  UserStore: {
    make: vi.fn(() => {
      return {
        getUser: vi.fn(async () => testUser),
      };
    }),
  },
}));

describe("authMiddleware", () => {
  it("get's the user from the session", async () => {
    const { requireUser } = await import("~/lib/session.server");
    vi.mocked(requireUser).mockResolvedValue({
      user_id: testUser.user_id,
    } as SessionUser);

    const context = {
      set: vi.fn(),
    };

    const next = vi.fn(async () => new Response("ok"));
    const result = await authMiddleware(
      {
        request: new Request("http://localhost/protected"),
        context,
      } as any,
      next,
    );
    expect(result).toBeDefined();

    expect(requireUser).toHaveBeenCalledWith(expect.any(Request));
    expect(context.set).toHaveBeenCalledWith(appContext, { user: testUser });
  });
});
