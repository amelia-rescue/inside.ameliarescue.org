import { afterEach, describe, expect, it, vi } from "vitest";
import { getXrayTraceId, runWithLogContext } from "./logger-context.server";
import { log } from "./logger";

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
