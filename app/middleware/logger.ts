import { appContext } from "~/context";
import { log } from "~/lib/logger";
import type { Route } from "../+types/root";

const SENSITIVE_PARAM =
  /credential|key|password|secret|signature|token|cookie|csrf/i;
const MAX_BODY_PARAM_LENGTH = 2000;

function redactBodyParams(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactBodyParams(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_PARAM.test(key) ? "[redacted]" : redactBodyParams(item),
      ]),
    );
  }
  if (typeof value === "string" && value.length > MAX_BODY_PARAM_LENGTH) {
    return `${value.slice(0, MAX_BODY_PARAM_LENGTH)}…[truncated]`;
  }
  return value;
}

function formDataToParams(formData: FormData): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key).map((value) =>
      typeof value === "string"
        ? value
        : {
            name: value.name,
            type: value.type,
            size: value.size,
          },
    );
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}

async function getBodyParams(request: Request): Promise<unknown> {
  if (!request.body) {
    return undefined;
  }
  const contentType = request.headers.get("content-type") || "";
  try {
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      return redactBodyParams(
        formDataToParams(await request.clone().formData()),
      );
    }
    if (contentType.includes("json")) {
      return redactBodyParams(await request.clone().json());
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const requestLogger: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  const start = performance.now();
  let response: Response;
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip");

  const body = await getBodyParams(request);

  try {
    response = await next();
  } catch (error) {
    response = Response.json(
      { message: "internal server error" },
      { status: 500 },
    );
    if (error instanceof Response && error.status <= 500) {
      response = error;
    }

    if (error instanceof Error) {
      log.error("error occurred", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  const url = new URL(request.url);
  const requestLog = {
    status: response.status,
    time: performance.now() - start,
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    user: context.get(appContext)?.user.user_id,
    agent: request.headers.get("user-agent"),
    ip_address: ipAddress,
  };

  if (response.status >= 500) {
    log.error("request_log", requestLog);
  } else {
    log.info("request_log", requestLog);
  }
  return response;
};

export { requestLogger };
