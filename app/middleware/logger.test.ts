import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "~/lib/logger";
import { getUser } from "~/lib/session.server";
import { requestLogger } from "./logger";

vi.mock("~/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("~/lib/session.server", () => ({
  getUser: vi.fn(async () => ({ user: null })),
}));

const request = new Request("https://example.test/admin/users?intent=delete", {
  method: "POST",
  headers: {
    "user-agent": "test-agent",
    "x-forwarded-for": "192.0.2.1, 198.51.100.1",
  },
});
const context = { get: vi.fn(() => null) };

afterEach(() => {
  vi.clearAllMocks();
});

describe("requestLogger", () => {
  it("logs returned 5xx responses as request errors", async () => {
    const response = new Response(null, { status: 503 });

    await expect(
      requestLogger(
        { request, context } as any,
        vi.fn(async () => response),
      ),
    ).resolves.toBe(response);

    expect(log.error).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({
        status: 503,
        method: "POST",
        path: "/admin/users",
        query: { intent: "delete" },
        agent: "test-agent",
        ip_address: "192.0.2.1",
      }),
    );
    expect(log.info).not.toHaveBeenCalledWith("request_log", expect.anything());
  });

  it("logs an application error even when session lookup fails", async () => {
    vi.mocked(getUser).mockRejectedValueOnce(new Error("session unavailable"));

    const response = await requestLogger(
      { request, context } as any,
      vi.fn(async () => {
        throw new Error("application failure");
      }),
    );

    expect(response!.status).toBe(500);
    expect(getUser).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "error occurred",
      expect.objectContaining({ error: "application failure" }),
    );
    expect(log.error).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({ status: 500 }),
    );
  });
});
