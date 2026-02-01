import { data, redirect, type ActionFunctionArgs } from "react-router";
import { appContext } from "~/context";
import { S3Helper } from "~/lib/s3-helper";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context.get(appContext);

  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const formData = await request.formData();
  const key = formData.get("key");

  if (typeof key !== "string" || !key) {
    return data({ error: "Missing key" }, { status: 400 });
  }

  try {
    const s3 = S3Helper.make();
    await s3.deleteObject(key);
    return data({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return data({ error: "Failed to delete document" }, { status: 500 });
  }
}
