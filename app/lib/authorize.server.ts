import { appContext, type Context } from "~/context";

// Route args expose `context` as a RouterContextProvider; only `get` is needed
// here, which also keeps these helpers trivial to call from tests.
type ContextProvider = { get: (key: typeof appContext) => Context | null };

// Thrown as a JSON Response rather than a redirect: every caller of these
// endpoints is a fetch() that checks `response.ok` and reads `error`, and a
// redirect would be followed transparently and look like a success.
function forbidden(): never {
  throw Response.json({ error: "Forbidden" }, { status: 403 });
}

export function requireContext(context: ContextProvider): Context {
  const ctx = context.get(appContext);
  if (!ctx?.user) {
    forbidden();
  }
  return ctx;
}

export function isAdmin(ctx: Context): boolean {
  return ctx.user.website_role === "admin";
}

export function requireAdmin(context: ContextProvider): Context {
  const ctx = requireContext(context);
  if (!isAdmin(ctx)) {
    forbidden();
  }
  return ctx;
}

// Members may only act on their own records; admins may act on anyone's.
export function requireSelfOrAdmin(
  context: ContextProvider,
  userId: string,
): Context {
  const ctx = requireContext(context);
  if (ctx.user.user_id !== userId && !isAdmin(ctx)) {
    forbidden();
  }
  return ctx;
}
