// Shared by server and client code, so it must not import anything server-only.

export const WEBSITE_ROLES = ["user", "admin", "root"] as const;
export type WebsiteRole = (typeof WEBSITE_ROLES)[number];

/** Root can do everything an admin can. */
export function hasAdminAccess(role: string | undefined | null): boolean {
  return role === "admin" || role === "root";
}

export function isRootRole(role: string | undefined | null): boolean {
  return role === "root";
}
