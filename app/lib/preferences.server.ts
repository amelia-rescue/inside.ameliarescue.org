import { createCookie } from "react-router";

// Create preferences cookie
export const preferencesCookie = createCookie("preferences", {
  httpOnly: false, // Allow client-side access for theme changes
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

export interface Preferences {
  theme: string;
}

/**
 * Get preferences from request
 */
export async function getPreferences(request: Request): Promise<Preferences> {
  const cookieHeader = request.headers.get("Cookie");
  const preferences = await preferencesCookie.parse(cookieHeader);

  return {
    theme: preferences?.theme || "forest",
  };
}

/**
 * Set preferences
 */
export async function setPreferences(preferences: Preferences) {
  return {
    "Set-Cookie": await preferencesCookie.serialize(preferences),
  };
}
