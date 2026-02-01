import { createCookie, redirect } from "react-router";
import { refreshAccessToken } from "./auth.server";
import { log } from "./logger";
import { getSessionSecret } from "./secrets.server";

let sessionSecretPromise: Promise<string> | null = null;

async function getOrInitSessionSecret(): Promise<string> {
  if (!sessionSecretPromise) {
    sessionSecretPromise = getSessionSecret();
  }
  return sessionSecretPromise;
}

async function getCookieOptions() {
  const sessionSecret = await getOrInitSessionSecret();
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  };
}

// Lazy cookie initialization
let userCookie: ReturnType<typeof createCookie> | null = null;
let accessTokenCookie: ReturnType<typeof createCookie> | null = null;
let refreshTokenCookie: ReturnType<typeof createCookie> | null = null;
let tempDataCookie: ReturnType<typeof createCookie> | null = null;

export async function getUserCookie() {
  if (!userCookie) {
    const options = await getCookieOptions();
    userCookie = createCookie("__user", {
      ...options,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return userCookie;
}

async function getAccessTokenCookie() {
  if (!accessTokenCookie) {
    const options = await getCookieOptions();
    accessTokenCookie = createCookie("__access_token", {
      ...options,
      maxAge: 60 * 60 * 24, // 1 day
    });
  }
  return accessTokenCookie;
}

async function getRefreshTokenCookie() {
  if (!refreshTokenCookie) {
    const options = await getCookieOptions();
    refreshTokenCookie = createCookie("__refresh_token", {
      ...options,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return refreshTokenCookie;
}

async function getTempDataCookie() {
  if (!tempDataCookie) {
    const options = await getCookieOptions();
    tempDataCookie = createCookie("__temp", {
      ...options,
      maxAge: 60 * 10, // 10 minutes for temporary auth data
    });
  }
  return tempDataCookie;
}

export interface SessionUser {
  user_id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface UserData {
  user_id: string;
  expiresAt: number;
}

/**
 * Get user data and tokens from cookies
 */
async function getUserFromCookies(
  request: Request,
): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("Cookie");
  const userCookieInstance = await getUserCookie();
  const accessTokenCookieInstance = await getAccessTokenCookie();
  const refreshTokenCookieInstance = await getRefreshTokenCookie();

  const userData = (await userCookieInstance.parse(
    cookieHeader,
  )) as UserData | null;
  const accessToken = (await accessTokenCookieInstance.parse(cookieHeader)) as
    | string
    | null;
  const refreshToken = (await refreshTokenCookieInstance.parse(
    cookieHeader,
  )) as string | null;

  if (!userData || !accessToken) {
    return null;
  }

  return {
    user_id: userData.user_id,
    accessToken,
    refreshToken: refreshToken || undefined,
    expiresAt: userData.expiresAt,
  };
}

/**
 * Get user from cookies, with optional token refresh
 * Returns user and session cookie header if tokens were refreshed
 */
export async function getUser(
  request: Request,
): Promise<{ user: SessionUser | null; sessionHeader?: string }> {
  const user = await getUserFromCookies(request);

  if (!user) {
    return { user: null };
  }

  // Check if token is expired
  if (user.expiresAt && Date.now() > user.expiresAt) {
    // Try to refresh the token if we have a refresh token
    if (user.refreshToken) {
      try {
        log.info("refreshing access token", { user });
        const tokens = await refreshAccessToken(user.refreshToken);

        // Update the user with new tokens
        const updatedUser: SessionUser = {
          ...user,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          // Keep existing refresh token or use new one if provided
          refreshToken: tokens.refresh_token || user.refreshToken,
        };

        // Serialize updated cookies
        const headers = new Headers();
        const userCookieInstance = await getUserCookie();
        const accessTokenCookieInstance = await getAccessTokenCookie();
        const refreshTokenCookieInstance = await getRefreshTokenCookie();

        headers.append(
          "Set-Cookie",
          await userCookieInstance.serialize({
            user_id: updatedUser.user_id,
            expiresAt: updatedUser.expiresAt,
          }),
        );
        headers.append(
          "Set-Cookie",
          await accessTokenCookieInstance.serialize(updatedUser.accessToken),
        );
        if (updatedUser.refreshToken) {
          headers.append(
            "Set-Cookie",
            await refreshTokenCookieInstance.serialize(
              updatedUser.refreshToken,
            ),
          );
        }

        // Return updated user and combined cookie headers
        return {
          user: updatedUser,
          sessionHeader: headers.get("Set-Cookie") || undefined,
        };
      } catch (error) {
        log.error("Token refresh failed", { error });
        // If refresh fails, return null to force re-authentication
        return { user: null };
      }
    }

    return { user: null };
  }

  return { user };
}

/**
 * Require authenticated user, redirect to login if not authenticated
 * Returns user and optional session header if tokens were refreshed
 */
export async function requireUser(
  request: Request,
  redirectTo: string = new URL(request.url).pathname,
): Promise<{ user: SessionUser; sessionHeader?: string }> {
  const { user, sessionHeader } = await getUser(request);
  if (!user) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/auth/login?${searchParams}`);
  }
  return { user, sessionHeader };
}

/**
 * Create user session with separate cookies
 */
export async function createUserSession(
  user: SessionUser,
  redirectTo: string = "/",
) {
  const headers = new Headers();
  const userCookieInstance = await getUserCookie();
  const accessTokenCookieInstance = await getAccessTokenCookie();
  const refreshTokenCookieInstance = await getRefreshTokenCookie();

  headers.append(
    "Set-Cookie",
    await userCookieInstance.serialize({
      user_id: user.user_id,
      expiresAt: user.expiresAt,
    }),
  );

  headers.append(
    "Set-Cookie",
    await accessTokenCookieInstance.serialize(user.accessToken),
  );

  if (user.refreshToken) {
    headers.append(
      "Set-Cookie",
      await refreshTokenCookieInstance.serialize(user.refreshToken),
    );
  }

  return redirect(redirectTo, { headers });
}

/**
 * Logout and destroy all session cookies
 */
export async function logout(request: Request, redirectTo: string = "/") {
  const headers = new Headers();
  const userCookieInstance = await getUserCookie();
  const accessTokenCookieInstance = await getAccessTokenCookie();
  const refreshTokenCookieInstance = await getRefreshTokenCookie();

  headers.append(
    "Set-Cookie",
    await userCookieInstance.serialize("", { maxAge: 0 }),
  );
  headers.append(
    "Set-Cookie",
    await accessTokenCookieInstance.serialize("", { maxAge: 0 }),
  );
  headers.append(
    "Set-Cookie",
    await refreshTokenCookieInstance.serialize("", { maxAge: 0 }),
  );

  return redirect(redirectTo, { headers });
}

/**
 * Store temporary auth data (code verifier, redirect path, etc.)
 */
export async function setSessionData(
  request: Request,
  data: Record<string, string>,
) {
  const cookieHeader = request.headers.get("Cookie");
  const tempDataCookieInstance = await getTempDataCookie();
  const existing =
    ((await tempDataCookieInstance.parse(cookieHeader)) as Record<
      string,
      string
    > | null) || {};

  const updated = { ...existing, ...data };

  return {
    headers: {
      "Set-Cookie": await tempDataCookieInstance.serialize(updated),
    },
  };
}

/**
 * Get temporary session data
 */
export async function getSessionData(
  request: Request,
  key: string,
): Promise<string | undefined> {
  const cookieHeader = request.headers.get("Cookie");
  const tempDataCookieInstance = await getTempDataCookie();
  const data = (await tempDataCookieInstance.parse(cookieHeader)) as Record<
    string,
    string
  > | null;
  return data?.[key];
}
