import { log } from "./logger";
import type { User } from "./user-store";

/**
 * Who changed which user, written to the app log as a `user_audit` line.
 * Nothing is stored in the database; search CloudWatch Logs Insights on
 * /aws/lambda/inside-amelia-rescue with `filter log_message = "user_audit"`.
 */
export type UserAuditAction =
  | "user_created"
  | "user_updated"
  | "user_deleted"
  | "user_restored"
  | "user_deleted_permanently"
  | "user_temporary_password_set";

type Person = Pick<User, "user_id" | "email" | "first_name" | "last_name">;
type Actor = Person & Pick<User, "website_role">;

export type UserChanges = Record<
  string,
  { from: unknown; to: unknown } | { changed: true }
>;

// Personal or free-text fields: the log says they changed, not to what.
const VALUE_HIDDEN_FIELDS = new Set(["phone", "note", "profile_picture_url"]);
// Bookkeeping fields that aren't edits anyone makes.
const IGNORED_FIELDS = new Set([
  "user_id",
  "created_at",
  "updated_at",
  "last_login_at",
]);

// Forms submit blank fields as "" and unchecked boxes as false, which mean the
// same as "not set".
function same(a: unknown, b: unknown) {
  const norm = (v: unknown) =>
    JSON.stringify(v === "" || v === false ? null : (v ?? null));
  return norm(a) === norm(b);
}

/** The fields in `update` whose values differ from `before`. */
export function diffUser(
  before: Partial<User>,
  update: Partial<User>,
): UserChanges {
  const changes: UserChanges = {};
  for (const [field, to] of Object.entries(update)) {
    if (IGNORED_FIELDS.has(field)) continue;
    const from = (before as Record<string, unknown>)[field];
    if (same(from, to)) continue;
    changes[field] = VALUE_HIDDEN_FIELDS.has(field)
      ? { changed: true }
      : { from: from ?? null, to: to ?? null };
  }
  return changes;
}

function person(p: Person) {
  return {
    user_id: p.user_id,
    email: p.email,
    name: `${p.first_name} ${p.last_name}`.trim(),
  };
}

export function logUserAudit(
  action: UserAuditAction,
  actor: Actor,
  target: Person,
  changes?: UserChanges,
) {
  log.info("user_audit", {
    action,
    actor: { ...person(actor), website_role: actor.website_role },
    target: person(target),
    ...(changes ? { changes } : {}),
  });
}
