import { redirect, type LoaderFunctionArgs } from "react-router";
import { getLogoutUrl } from "~/lib/auth.server";
import { logout } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Redirect to Cognito logout while also destroying local session
  const logoutUrl = getLogoutUrl(request);
  return logout(request, logoutUrl);
}
