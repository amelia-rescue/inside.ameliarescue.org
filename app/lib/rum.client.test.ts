import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  AwsRum: vi.fn(),
  RRWebPlugin: vi.fn(),
  recordError: vi.fn(),
  recordPageView: vi.fn(),
}));

vi.mock("aws-rum-web", () => ({
  AwsRum: sdk.AwsRum,
  RRWebPlugin: sdk.RRWebPlugin,
}));

const config = {
  applicationId: "monitor-id",
  region: "us-east-2",
  alias: "inside.ameliarescue.org",
  releaseId: "release-id",
  userId: "member-id",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sdk.AwsRum.mockImplementation(() => ({
    recordError: sdk.recordError,
    recordPageView: sdk.recordPageView,
  }));
  sdk.RRWebPlugin.mockImplementation((options) => ({ options }));
  window.history.replaceState({}, "", "/");
});

describe("CloudWatch RUM client", () => {
  it("initializes once with explicit privacy and cost controls", async () => {
    const { initializeRum } = await import("./rum.client");

    initializeRum(config);
    initializeRum(config);

    expect(sdk.AwsRum).toHaveBeenCalledTimes(1);
    expect(sdk.RRWebPlugin).toHaveBeenCalledWith({
      additionalSampleRate: 1,
      recordOptions: { blockSelector: "a, img" },
    });
    const [applicationId, version, region, clientConfig] =
      sdk.AwsRum.mock.calls[0];
    expect([applicationId, version, region]).toEqual([
      "monitor-id",
      "release-id",
      "us-east-2",
    ]);
    expect(clientConfig).toMatchObject({
      alias: "inside.ameliarescue.org",
      allowCookies: true,
      disableAutoPageView: true,
      enableXRay: true,
      recordResourceUrl: false,
      releaseId: "release-id",
      sessionEventLimit: 200,
      sessionSampleRate: 1,
      signing: false,
      userId: "member-id",
    });
    expect(
      clientConfig.pagesToExclude[0].test(
        `${window.location.origin}/auth/callback?code=secret`,
      ),
    ).toBe(true);
    expect(clientConfig.telemetries.slice(0, 2)).toEqual([
      "errors",
      "performance",
    ]);
    const [, httpConfig] = clientConfig.telemetries[2];
    expect(httpConfig).toMatchObject({ recordAllRequests: false });
    expect(
      httpConfig.urlsToInclude[0].test(`${window.location.origin}/profile`),
    ).toBe(true);
    expect(
      httpConfig.urlsToInclude[0].test("https://bucket.s3.amazonaws.com/x"),
    ).toBe(false);
    expect(
      httpConfig.addXRayTraceIdHeader[0].test(
        `${window.location.origin}/profile`,
      ),
    ).toBe(true);
    expect(
      httpConfig.addXRayTraceIdHeader[0].test(
        "https://bucket.s3.amazonaws.com/x",
      ),
    ).toBe(false);
    expect(
      httpConfig.urlsToExclude.some((pattern: RegExp) =>
        pattern.test(`${window.location.origin}/auth/callback?code=secret`),
      ),
    ).toBe(true);
    expect(
      httpConfig.urlsToExclude.some((pattern: RegExp) =>
        pattern.test(
          `${window.location.origin}/api/truck-checks/check-123/sync?connect=1`,
        ),
      ),
    ).toBe(true);
  });

  it("normalizes dynamic routes and removes query strings", async () => {
    const { initializeRum, normalizeRumPageId, recordRumPageView } =
      await import("./rum.client");
    initializeRum(config);

    expect(normalizeRumPageId("/admin/update-user/member-1")).toBe(
      "/admin/update-user/:user_id",
    );
    expect(normalizeRumPageId("/user/member-1/")).toBe("/user/:user_id");
    expect(normalizeRumPageId("/truck-checks/check-1")).toBe(
      "/truck-checks/:id",
    );
    expect(normalizeRumPageId("/profile")).toBe("/profile");

    recordRumPageView("/user/member-1?token=secret#details");
    expect(sdk.recordPageView).toHaveBeenCalledWith("/user/:user_id");
  });

  it("does nothing without runtime configuration", async () => {
    const { initializeRum } = await import("./rum.client");

    expect(initializeRum()).toBeUndefined();
    expect(sdk.AwsRum).not.toHaveBeenCalled();
  });

  it("keeps initialization failures from affecting the application", async () => {
    sdk.AwsRum.mockImplementation(() => {
      throw new Error("unavailable");
    });
    const { initializeRum, recordRumError, recordRumPageView } =
      await import("./rum.client");

    expect(initializeRum(config)).toBeUndefined();
    expect(() => recordRumPageView("/profile")).not.toThrow();
    expect(() => recordRumError(new Error("render failed"))).not.toThrow();
  });
});
