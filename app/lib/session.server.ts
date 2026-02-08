import { createCookie, redirect } from "react-router";
import { refreshAccessToken } from "./auth.server";
import { log } from "./logger";
import { getSessionSecret } from "./secrets.server";
import { SessionStore } from "./session-store";
import dayjs from "dayjs";

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
  session_id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accessTokenExpiresAt: string;
}

interface UserData {
  user_id: string;
  session_id: string;
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

  const userData = (await userCookieInstance.parse(
    cookieHeader,
  )) as UserData | null;

  if (!userData) {
    return null;
  }

  const sessionStore = SessionStore.make();
  let storedSession: Awaited<ReturnType<typeof sessionStore.getSession>> | null;
  try {
    storedSession = await sessionStore.getSession(
      userData.user_id,
      userData.session_id,
    );
  } catch (error) {
    return null;
  }

  return {
    user_id: userData.user_id,
    session_id: storedSession.session_id,
    refreshToken: storedSession.refresh_token,
    accessToken: storedSession.access_token,
    expiresAt: userData.expiresAt,
    accessTokenExpiresAt: storedSession.access_token_expires_at,
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

  const sessionStore = SessionStore.make();
  const now = dayjs();
  try {
    const storedSession = await sessionStore.getSession(
      user.user_id,
      user.session_id,
    );
    const expiresAt = dayjs.unix(storedSession.expires_at);
    if (expiresAt.isBefore(now)) {
      await sessionStore.deleteSession(user.user_id, user.session_id);
      return { user: null };
    }
  } catch (error) {
    log.info("session not found when attempting to get user", {
      user,
      error,
    });
    return { user: null };
  }

  // Check if token is expired
  if (dayjs(user.accessTokenExpiresAt).isBefore(now)) {
    // Try to refresh the token if we have a refresh token
    if (user.refreshToken) {
      try {
        log.info("refreshing access token", { user });
        const tokens = await refreshAccessToken(user.refreshToken);

        const updatedSession = await sessionStore.updateSession({
          user_id: user.user_id,
          session_id: user.session_id,
          expires_at: dayjs().add(29, "days").add(23, "hours").unix(),
          refresh_token: user.refreshToken,
          access_token: tokens.access_token,
          access_token_expires_at: dayjs()
            .add(tokens.expires_in, "seconds")
            .toISOString(),
        });

        // Update the user with new tokens
        const updatedUser: SessionUser = {
          ...user,
          accessToken: tokens.access_token,
          expiresAt: updatedSession.expires_at,
          // Keep existing refresh token or use new one if provided
          refreshToken: updatedSession.refresh_token,
          accessTokenExpiresAt: updatedSession.access_token_expires_at,
        };

        // Serialize updated cookies
        const headers = new Headers();
        const userCookieInstance = await getUserCookie();

        headers.append(
          "Set-Cookie",
          await userCookieInstance.serialize({
            user_id: updatedUser.user_id,
            session_id: updatedUser.session_id,
            expiresAt: updatedUser.expiresAt,
          }),
        );

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

  const sessionStore = SessionStore.make();

  await sessionStore.createSession({
    user_id: user.user_id,
    session_id: user.session_id,
    expires_at: user.expiresAt,
    refresh_token: user.refreshToken,
    access_token: user.accessToken,
    access_token_expires_at: user.accessTokenExpiresAt,
  });

  headers.append(
    "Set-Cookie",
    await userCookieInstance.serialize({
      user_id: user.user_id,
      session_id: user.session_id,
      expiresAt: user.expiresAt,
    }),
  );

  return redirect(redirectTo, { headers });
}

/**
 * Logout and destroy all session cookies
 */
export async function logout(request: Request, redirectTo: string = "/") {
  const headers = new Headers();
  const userCookieInstance = await getUserCookie();

  try {
    const sessionUser = await getUserFromCookies(request);
    if (sessionUser) {
      const sessionStore = SessionStore.make();
      await sessionStore.deleteSession(
        sessionUser.user_id,
        sessionUser.session_id,
      );
    }
  } catch (error) {
    log.info("session not found when attempting to logout", {
      userCookieInstance,
      error,
    });
  }
  headers.append(
    "Set-Cookie",
    await userCookieInstance.serialize("", { maxAge: 0 }),
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
