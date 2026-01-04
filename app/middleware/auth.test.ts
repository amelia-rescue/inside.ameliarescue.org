import { describe, expect, it, vi } from "vitest";
import { authMiddleware } from "./auth";
import { appContext } from "~/context";

vi.mock("~/lib/session.server", () => ({
  requireUser: vi.fn(),
}));

describe("authMiddleware", () => {
  it("get's the user from the session", async () => {
    const { requireUser } = await import("~/lib/session.server");
    const user = { id: "user_1" } as any;
    vi.mocked(requireUser).mockResolvedValue(user);

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
    expect(context.set).toHaveBeenCalledWith(appContext, { user });
  });
});
