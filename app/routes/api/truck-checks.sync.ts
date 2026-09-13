import type { Route } from "./+types/truck-checks.sync";
import { appContext } from "~/context";
import {
  applyCheckMutation,
  InvalidFieldMutation,
  toSnapshot,
} from "~/lib/truck-check/mutations.server";
import {
  TruckCheckStore,
  TruckCheckNotFound,
  TruckCheckLocked,
  TruckCheckCapacityExceeded,
} from "~/lib/truck-check/truck-check-store";
import {
  isFieldMutation,
  type SyncResponse,
} from "~/lib/truck-check/sync-protocol";
import { log } from "~/lib/logger";

const reply = (body: SyncResponse, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const user = context.get(appContext)?.user;
  if (!user)
    return reply(
      { code: "unauthorized", error: "Sign in to resume saving." },
      401,
    );
  try {
    const check = await TruckCheckStore.make().getTruckCheck(params.id);
    return reply({
      snapshot: toSnapshot(check, user.user_id),
      ...(new URL(request.url).searchParams.get("connect") === "1"
        ? { accessToken: user.accessToken }
        : {}),
    });
  } catch (error) {
    return failure(error, params.id);
  }
}

export async function action({ params, context, request }: Route.ActionArgs) {
  const user = context.get(appContext)?.user;
  if (!user)
    return reply(
      { code: "unauthorized", error: "Sign in to resume saving." },
      401,
    );
  if (request.headers.get("X-Truck-Check-User") !== user.user_id)
    return reply(
      {
        code: "unauthorized",
        error:
          "Your signed-in account changed. Sign in as the original user to save these edits.",
      },
      401,
    );
  const expectedOrigin = new URL(process.env.APP_URL || request.url).origin;
  if (
    request.method !== "POST" ||
    request.headers.get("Origin") !== expectedOrigin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  ) {
    return reply(
      { code: "invalid", error: "Invalid request origin or method." },
      403,
    );
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 24_000)
      return reply({ code: "invalid", error: "Change is too large." }, 413);
    let mutation: unknown;
    try {
      mutation = JSON.parse(text);
    } catch {
      return reply({ code: "invalid", error: "Invalid change." }, 400);
    }
    if (!isFieldMutation(mutation))
      return reply({ code: "invalid", error: "Invalid change." }, 400);
    return reply(
      await applyCheckMutation({
        id: params.id,
        userId: user.user_id,
        contributor: { first_name: user.first_name, last_name: user.last_name },
        mutation,
      }),
    );
  } catch (error) {
    return failure(error, params.id, user.user_id);
  }
}

async function failure(error: unknown, id: string, userId?: string) {
  if (error instanceof TruckCheckNotFound)
    return reply(
      { code: "missing", error: "This truck check was deleted." },
      404,
    );
  if (error instanceof TruckCheckLocked) {
    const check = await TruckCheckStore.make().getTruckCheck(id);
    return reply(
      {
        code: "locked",
        error: error.message,
        ...(userId ? { snapshot: toSnapshot(check, userId) } : {}),
      },
      409,
    );
  }
  if (
    error instanceof InvalidFieldMutation ||
    error instanceof TruckCheckCapacityExceeded
  )
    return reply({ code: "invalid", error: error.message }, 422);
  log.error("truck_check_sync_failed", {
    checkId: id,
    error: error instanceof Error ? error.name : "unknown",
  });
  return reply(
    {
      code: "retry",
      error: "Unable to sync. Changes will retry automatically.",
    },
    503,
  );
}
