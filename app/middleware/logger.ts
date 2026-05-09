import { log } from "~/lib/logger";
import type { Route } from "../+types/root";
import { getUser } from "~/lib/session.server";

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

    const url = new URL(request.url);
    const query = url.searchParams;
    const { user } = await getUser(request);
    log.info("request_log", {
      status: response.status,
      time: performance.now() - start,
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(query.entries()),
      user: user?.user_id,
      agent: request.headers.get("user-agent"),
      ip_address: ipAddress,
    });
    return response;
  } catch (error) {
    let response = Response.json(
      { message: "internal server error" },
      { status: 500 },
    );
    if (error instanceof Response) {
      if (error.status <= 500) {
        response = error;
      }
    }
    const url = new URL(request.url);
    const query = url.searchParams;
    const { user } = await getUser(request);

    if (error instanceof Error) {
      log.error("error occurred", {
        error: error.message,
        stack: error.stack,
      });
    }

    log.info("request_log", {
      status: response.status,
      time: performance.now() - start,
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(query.entries()),
      user: user?.user_id,
      agent: request.headers.get("user-agent"),
      ip_address: ipAddress,
    });
    return response;
  }
};

export { requestLogger };
