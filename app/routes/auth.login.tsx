import { redirect, type LoaderFunctionArgs } from "react-router";
import { getLoginUrl } from "~/lib/auth.server";
import { getUser, setSessionData } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // If already logged in, redirect to home
  const user = await getUser(request);
  if (user) {
    return redirect("/");
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/";

  // Generate login URL with PKCE
  const loginData = await getLoginUrl(request);
  const { url: loginUrl, codeVerifier } = JSON.parse(loginData);

  // Store code verifier and redirect path in session
  const sessionHeaders = await setSessionData(request, {
    codeVerifier,
    redirectTo,
  });

  // Redirect to Cognito hosted UI
  return redirect(loginUrl, sessionHeaders);
}
