import { appContext } from "~/context";
import { log } from "~/lib/logger";
import type { Route } from "../+types/root";

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
