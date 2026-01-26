import { createCookieSessionStorage, redirect } from "react-router";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "default-secret-change-in-production";

// Create session storage
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export interface SessionUser {
  user_id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Get session from request
 */
export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

/**
 * Get user from session, with optional token refresh
 * Returns user and session cookie header if tokens were refreshed
 */
export async function getUser(
  request: Request,
): Promise<{ user: SessionUser | null; sessionHeader?: string }> {
  const session = await getSession(request);
  const user = session.get("user") as SessionUser | undefined;

  if (!user) {
    return { user: null };
  }

  // Check if token is expired
  if (user.expiresAt && Date.now() > user.expiresAt) {
    // Try to refresh the token if we have a refresh token
    if (user.refreshToken) {
      try {
        const { refreshAccessToken } = await import("./auth.server");
        const tokens = await refreshAccessToken(user.refreshToken);

        // Update the session with new tokens
        const updatedUser: SessionUser = {
          ...user,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          // Keep existing refresh token or use new one if provided
          refreshToken: tokens.refresh_token || user.refreshToken,
        };

        session.set("user", updatedUser);

        // Return updated user and session header to commit changes
        return {
          user: updatedUser,
          sessionHeader: await sessionStorage.commitSession(session),
        };
      } catch (error) {
        console.error("Token refresh failed:", error);
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
 * Create user session
 */
export async function createUserSession(
  user: SessionUser,
  redirectTo: string = "/",
) {
  const session = await sessionStorage.getSession();
  session.set("user", user);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

/**
 * Logout and destroy session
 */
export async function logout(request: Request, redirectTo: string = "/") {
  const session = await getSession(request);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}

/**
 * Store temporary auth data (code verifier, redirect path, etc.)
 */
export async function setSessionData(
  request: Request,
  data: Record<string, string>,
) {
  const session = await getSession(request);
  Object.entries(data).forEach(([key, value]) => {
    session.set(key, value);
  });
  return {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
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
  const session = await getSession(request);
  return session.get(key);
}
