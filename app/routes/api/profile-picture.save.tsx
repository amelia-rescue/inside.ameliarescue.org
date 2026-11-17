import { data } from "react-router";
import type { Route } from "./+types/profile-picture.save";
import { UserStore } from "~/lib/user-store";
import { requireSelfOrAdmin } from "~/lib/authorize.server";
import { log } from "~/lib/logger";
import { diffUser, logUserAudit } from "~/lib/user-audit.server";

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("user_id") as string;
  const fileUrl = formData.get("file_url") as string;

  if (!userId || !fileUrl) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  const ctx = requireSelfOrAdmin(context, userId);

  try {
    const userStore = UserStore.make();
    const target = await userStore.getUser(userId);
    const update = { user_id: userId, profile_picture_url: fileUrl };
    await userStore.updateUser(update);
    logUserAudit("user_updated", ctx.user, target, diffUser(target, update));

    return data({ success: true });
  } catch (error) {
    log.error("Error saving profile picture", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return data({ error: "Failed to save profile picture" }, { status: 500 });
  }
}
