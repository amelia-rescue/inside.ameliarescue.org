import dayjs from "dayjs";
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

    if (!tokens.refresh_token) {
      throw new Error("No refresh token received");
    }

    // Get user info
    const userInfo = await getUserInfo(tokens.access_token);

    // Create user session
    return createUserSession(
      {
        user_id: userInfo.sub as string,
        session_id: crypto.randomUUID(),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        // goes into the ttl'd field in dynamo - must be epoch seconds
        // this is also 1 hour less than what is configured in cdk-stack.ts
        // if I ever have to adjust it and forget to do it here there will be problems
        // too lazy to centralize config
        expiresAt: dayjs().add(29, "days").add(23, "hours").unix(),
        accessTokenExpiresAt: dayjs()
          .add(tokens.expires_in, "seconds")
          .toISOString(),
      },
      redirectTo,
    );
  } catch (error) {
    console.error("Auth callback error:", error);
    return redirect("/auth/login?error=authentication_failed");
  }
}
