import { requireUser } from "~/lib/session.server";
import type { Route } from "../+types/root";
import { appContext } from "~/context";

export const authMiddleware: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  const excludedPaths = ["/auth/login", "/auth/logout", "/auth/callback"];
  if (excludedPaths.includes(new URL(request.url).pathname)) {
    return await next();
  }
  const user = await requireUser(request);
  context.set(appContext, {
    user,
  });
  return await next();
};
