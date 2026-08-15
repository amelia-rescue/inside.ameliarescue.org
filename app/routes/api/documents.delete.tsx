import { data, type ActionFunctionArgs } from "react-router";
import { S3Helper } from "~/lib/s3-helper";
import { requireAdmin } from "~/lib/authorize.server";

export async function action({ request, context }: ActionFunctionArgs) {
  requireAdmin(context);

  const formData = await request.formData();
  const key = formData.get("key");

  if (typeof key !== "string" || !key) {
    return data({ error: "Missing key" }, { status: 400 });
  }

  // This endpoint only manages org documents; it must not be able to delete
  // certifications, profile pictures or truck-check images.
  if (!key.startsWith("files/documents/")) {
    return data({ error: "Invalid key" }, { status: 400 });
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
