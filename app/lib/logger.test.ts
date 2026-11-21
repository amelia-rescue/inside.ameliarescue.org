import { afterEach, describe, expect, it, vi } from "vitest";
import { getXrayTraceId, runWithLogContext } from "./logger-context.server";
import { formatLogLine, log } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("logger context", () => {
  it("adds invocation context to logs across async work", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const output: Record<string, unknown>[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => {
      output.push(JSON.parse(value));
    });

    await Promise.all([
      runWithLogContext(
        { requestId: "request-1", xrayTraceId: "trace-1" },
        async () => {
          await Promise.resolve();
          log.info("first", { requestId: "overridden" });
        },
      ),
      runWithLogContext(
        { requestId: "request-2", xrayTraceId: "trace-2" },
        async () => {
          await Promise.resolve();
          log.warn("second");
        },
      ),
    ]);

    expect(output).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "request-1",
          xrayTraceId: "trace-1",
          level: "info",
          log_message: "first",
        }),
        expect.objectContaining({
          requestId: "request-2",
          xrayTraceId: "trace-2",
          level: "warn",
          log_message: "second",
        }),
      ]),
    );

    log.info("outside");
    expect(output.at(-1)).not.toHaveProperty("requestId");
  });

  it("serializes Error objects instead of logging {}", () => {
    const cause = new TypeError("fetch failed");
    const error = Object.assign(
      new Error("Token refresh failed: invalid_grant", { cause }),
      { $metadata: { httpStatusCode: 400 } },
    );

    const line = JSON.parse(formatLogLine("error", "oops", { error }));

    expect(line.error).toMatchObject({
      name: "Error",
      message: "Token refresh failed: invalid_grant",
      $metadata: { httpStatusCode: 400 },
      cause: { name: "TypeError", message: "fetch failed" },
    });
    expect(line.error.stack).toContain("Token refresh failed");
  });

  it("still logs the message when the payload can't be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const line = JSON.parse(formatLogLine("warn", "hello", { circular }));

    expect(line).toMatchObject({ level: "warn", log_message: "hello" });
    expect(line.log_serialization_error).toMatch(/circular/i);
  });

  it("extracts the root X-Ray trace ID", () => {
    expect(
      getXrayTraceId(
        "Root=1-6aa8bc93-51c5f8ef5f2720f713a20844;Parent=dfefb2bc00bf89b4;Sampled=1",
      ),
    ).toBe("1-6aa8bc93-51c5f8ef5f2720f713a20844");
    vi.stubEnv("_X_AMZN_TRACE_ID", "");
    expect(getXrayTraceId()).toBeUndefined();
  });
});
