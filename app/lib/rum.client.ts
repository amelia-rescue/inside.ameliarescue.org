import { AwsRum, RRWebPlugin, type AwsRumConfig } from "aws-rum-web";

export interface RumRuntimeConfig {
  applicationId: string;
  region: string;
  alias: string;
  releaseId: string;
  userId: string;
}

let rum: AwsRum | undefined;
let initializationAttempted = false;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeRumPageId(pathname: string) {
  if (/^\/admin\/update-user\/[^/]+\/?$/.test(pathname)) {
    return "/admin/update-user/:user_id";
  }
  if (/^\/user\/[^/]+\/?$/.test(pathname)) {
    return "/user/:user_id";
  }
  if (/^\/truck-checks\/[^/]+\/?$/.test(pathname)) {
    return "/truck-checks/:id";
  }
  return pathname;
}

export function initializeRum(config?: RumRuntimeConfig) {
  if (
    rum ||
    initializationAttempted ||
    !config ||
    typeof window === "undefined"
  ) {
    return rum;
  }

  initializationAttempted = true;
  const origin = escapeRegExp(window.location.origin);
  const sameOrigin = new RegExp(`^${origin}(?:/|$)`);
  const clientConfig: AwsRumConfig = {
    alias: config.alias,
    allowCookies: true,
    disableAutoPageView: true,
    endpoint: `https://dataplane.rum.${config.region}.amazonaws.com`,
    enableXRay: true,
    eventPluginsToLoad: [
      new RRWebPlugin({
        additionalSampleRate: 1,
        recordOptions: { blockSelector: "a, img" },
      }),
    ],
    pagesToExclude: [new RegExp(`^${origin}/auth(?:/|$)`)],
    recordResourceUrl: false,
    releaseId: config.releaseId,
    sessionEventLimit: 200,
    sessionSampleRate: 1,
    signing: false,
    userId: config.userId,
    telemetries: [
      "errors",
      "performance",
      [
        "http",
        {
          addXRayTraceIdHeader: [sameOrigin],
          recordAllRequests: false,
          urlsToInclude: [sameOrigin],
          urlsToExclude: [
            new RegExp(`^${origin}/auth(?:/|$)`),
            new RegExp(`^${origin}/api/truck-checks/[^/]+/sync(?:[?#]|$)`),
          ],
        },
      ],
    ],
  };

  try {
    rum = new AwsRum(
      config.applicationId,
      config.releaseId,
      config.region,
      clientConfig,
    );
  } catch {
    rum = undefined;
  }

  return rum;
}

export function recordRumPageView(pathname: string) {
  rum?.recordPageView(normalizeRumPageId(pathname.split(/[?#]/, 1)[0]));
}

export function recordRumError(error: Error) {
  rum?.recordError(error);
}
