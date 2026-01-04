import { redirect, type LoaderFunctionArgs } from "react-router";
import { exchangeCodeForTokens, getUserInfo } from "~/lib/auth.server";
import { createUserSession, getSessionData } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error);
    return redirect("/auth/login?error=" + encodeURIComponent(error));
  }

  if (!code) {
    return redirect("/auth/login?error=missing_code");
  }

  try {
    // Retrieve code verifier from session
    const codeVerifier = await getSessionData(request, "codeVerifier");
    const redirectTo = (await getSessionData(request, "redirectTo")) || "/";

    if (!codeVerifier) {
      return redirect("/auth/login?error=missing_verifier");
    }

    // Determine callback URL from request
    const callbackUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/auth/callback`
      : `${url.protocol}//${url.host}/auth/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier, callbackUrl);

    // Get user info
    const userInfo = await getUserInfo(tokens.access_token);

    // Calculate token expiration
    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

    // Create user session
    return createUserSession(
      {
        id: (userInfo.sub as string) || "",
        email: (userInfo.email as string) || "",
        givenName: (userInfo.given_name as string) || "",
        familyName: (userInfo.family_name as string) || "",
        accessToken: tokens.access_token,
        idToken: tokens.id_token || "",
        expiresAt,
      },
      redirectTo,
    );
  } catch (error) {
    console.error("Auth callback error:", error);
    return redirect("/auth/login?error=authentication_failed");
  }
}
