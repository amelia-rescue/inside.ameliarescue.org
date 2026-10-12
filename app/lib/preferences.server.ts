import { createCookie } from "react-router";

// Create preferences cookie
export const preferencesCookie = createCookie("preferences", {
  httpOnly: false, // Allow client-side access for theme changes
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof themePreferences)[number];

// Older cookies may hold retired daisyUI themes ("forest", "retro"); those
// fall back to following the device setting.
export function normalizeTheme(theme: unknown): ThemePreference {
  return themePreferences.includes(theme as ThemePreference)
    ? (theme as ThemePreference)
    : "system";
}

export interface Preferences {
  theme: ThemePreference;
  locale: string;
  timeZone: string;
}

function getRequestLocale(request: Request) {
  const acceptLanguage = request.headers.get("Accept-Language");
  const locale = acceptLanguage?.split(",")[0]?.trim();
  return locale || "en-US";
}

function isValidTimeZone(timeZone: string | undefined) {
  if (!timeZone) {
    return false;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get preferences from request
 */
export async function getPreferences(request: Request): Promise<Preferences> {
  const cookieHeader = request.headers.get("Cookie");
  const preferences = await preferencesCookie.parse(cookieHeader);
  const timeZone =
    typeof preferences?.timeZone === "string" &&
    isValidTimeZone(preferences.timeZone)
      ? preferences.timeZone
      : "UTC";

  return {
    theme: normalizeTheme(preferences?.theme),
    locale: preferences?.locale || getRequestLocale(request),
    timeZone,
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
