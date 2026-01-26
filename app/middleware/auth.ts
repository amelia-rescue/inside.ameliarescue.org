import { requireUser } from "~/lib/session.server";
import type { Route } from "../+types/root";
import { appContext } from "~/context";
import { UserStore } from "~/lib/user-store";
import { getPreferences } from "~/lib/preferences.server";

export const authMiddleware: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  const excludedPaths = ["/auth/login", "/auth/logout", "/auth/callback"];
  if (excludedPaths.includes(new URL(request.url).pathname)) {
    return await next();
  }
  const sessionUser = await requireUser(request);
  const userStore = UserStore.make();
  const user = await userStore.getUser(sessionUser.user_id);
  const preferences = await getPreferences(request);
  context.set(appContext, {
    user,
    theme: preferences.theme,
  });
  return await next();
};
