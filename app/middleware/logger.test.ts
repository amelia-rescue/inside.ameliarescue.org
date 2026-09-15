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

  it("logs form body params and leaves the body readable for handlers", async () => {
    const formRequest = new Request("https://example.test/profile", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=Sam&phone=555-1234",
    });
    const response = new Response(null, { status: 200 });

    await requestLogger(
      { request: formRequest, context } as any,
      vi.fn(async () => {
        expect(await formRequest.text()).toBe("name=Sam&phone=555-1234");
        return response;
      }),
    );

    expect(log.info).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({
        status: 200,
        body: { name: "Sam", phone: "555-1234" },
      }),
    );
  });

  it("logs redacted JSON body params", async () => {
    const jsonRequest = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: "user-1",
        password: "hunter2",
        nested: { access_token: "abc123", keep: "me" },
      }),
    });
    const response = new Response(null, { status: 500 });

    await requestLogger(
      { request: jsonRequest, context } as any,
      vi.fn(async () => response),
    );

    expect(log.error).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({
        status: 500,
        body: {
          user_id: "user-1",
          password: "[redacted]",
          nested: { access_token: "[redacted]", keep: "me" },
        },
      }),
    );
  });

  it("logs multipart file fields as metadata only", async () => {
    const formData = new FormData();
    formData.append("intent", "upload");
    formData.append(
      "attachment",
      new File(["file-bytes"], "photo.png", { type: "image/png" }),
    );
    const multipartRequest = new Request("https://example.test/api/upload", {
      method: "POST",
      body: formData,
    });
    const response = new Response(null, { status: 200 });

    await requestLogger(
      { request: multipartRequest, context } as any,
      vi.fn(async () => response),
    );

    expect(log.info).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({
        body: {
          intent: "upload",
          attachment: {
            name: "photo.png",
            type: "image/png",
            size: 10,
          },
        },
      }),
    );
  });

  it("still logs the request when the body cannot be parsed", async () => {
    const malformedRequest = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const response = new Response(null, { status: 200 });

    await requestLogger(
      { request: malformedRequest, context } as any,
      vi.fn(async () => response),
    );

    expect(log.info).toHaveBeenCalledWith(
      "request_log",
      expect.objectContaining({ status: 200, path: "/api" }),
    );
  });
});
