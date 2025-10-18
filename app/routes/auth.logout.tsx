import { redirect, type LoaderFunctionArgs } from "react-router";
import { getLogoutUrl } from "~/lib/auth.server";
import { logout } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Destroy local session
  await logout(request);

  // Redirect to Cognito logout
  const logoutUrl = getLogoutUrl(request);
  return redirect(logoutUrl);
}
