import { data } from "react-router";
import type { Route } from "./+types/profile-picture.save";
import { UserStore } from "~/lib/user-store";
import { requireSelfOrAdmin } from "~/lib/authorize.server";

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("user_id") as string;
  const fileUrl = formData.get("file_url") as string;

  if (!userId || !fileUrl) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  requireSelfOrAdmin(context, userId);

  try {
    const userStore = UserStore.make();
    await userStore.updateUser({
      user_id: userId,
      profile_picture_url: fileUrl,
    });

    return data({ success: true });
  } catch (error) {
    console.error("Error saving profile picture:", error);
    return data({ error: "Failed to save profile picture" }, { status: 500 });
  }
}
