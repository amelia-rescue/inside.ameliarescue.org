import { createCookie, redirect } from "react-router";
import { refreshAccessToken } from "./auth.server";
import { log } from "./logger";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "default-secret-change-in-production";

const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secrets: [SESSION_SECRET],
  secure: process.env.NODE_ENV === "production",
};

// Create separate cookies for user data and tokens
const userCookie = createCookie("__user", {
  ...cookieOptions,
  maxAge: 60 * 60 * 24 * 30, // 30 days
});

const accessTokenCookie = createCookie("__access_token", {
  ...cookieOptions,
  maxAge: 60 * 60 * 24, // 1 day
});

const refreshTokenCookie = createCookie("__refresh_token", {
  ...cookieOptions,
  maxAge: 60 * 60 * 24 * 30, // 30 days
});

const tempDataCookie = createCookie("__temp", {
  ...cookieOptions,
  maxAge: 60 * 10, // 10 minutes for temporary auth data
});

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
  const userData = (await userCookie.parse(cookieHeader)) as UserData | null;
  const accessToken = (await accessTokenCookie.parse(cookieHeader)) as
    | string
    | null;
  const refreshToken = (await refreshTokenCookie.parse(cookieHeader)) as
    | string
    | null;

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
        headers.append(
          "Set-Cookie",
          await userCookie.serialize({
            user_id: updatedUser.user_id,
            expiresAt: updatedUser.expiresAt,
          }),
        );
        headers.append(
          "Set-Cookie",
          await accessTokenCookie.serialize(updatedUser.accessToken),
        );
        if (updatedUser.refreshToken) {
          headers.append(
            "Set-Cookie",
            await refreshTokenCookie.serialize(updatedUser.refreshToken),
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

  headers.append(
    "Set-Cookie",
    await userCookie.serialize({
      user_id: user.user_id,
      expiresAt: user.expiresAt,
    }),
  );

  headers.append(
    "Set-Cookie",
    await accessTokenCookie.serialize(user.accessToken),
  );

  if (user.refreshToken) {
    headers.append(
      "Set-Cookie",
      await refreshTokenCookie.serialize(user.refreshToken),
    );
  }

  return redirect(redirectTo, { headers });
}

/**
 * Logout and destroy all session cookies
 */
export async function logout(request: Request, redirectTo: string = "/") {
  const headers = new Headers();

  headers.append("Set-Cookie", await userCookie.serialize("", { maxAge: 0 }));
  headers.append(
    "Set-Cookie",
    await accessTokenCookie.serialize("", { maxAge: 0 }),
  );
  headers.append(
    "Set-Cookie",
    await refreshTokenCookie.serialize("", { maxAge: 0 }),
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
  const existing =
    ((await tempDataCookie.parse(cookieHeader)) as Record<
      string,
      string
    > | null) || {};

  const updated = { ...existing, ...data };

  return {
    headers: {
      "Set-Cookie": await tempDataCookie.serialize(updated),
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
  const data = (await tempDataCookie.parse(cookieHeader)) as Record<
    string,
    string
  > | null;
  return data?.[key];
}
