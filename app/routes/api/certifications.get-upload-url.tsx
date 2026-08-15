import { data } from "react-router";
import type { Route } from "./+types/certifications.get-upload-url";
import { S3Helper } from "~/lib/s3-helper";
import { requireSelfOrAdmin } from "~/lib/authorize.server";

// Matches the accept list on the upload form. The extension is derived from the
// content type so a client cannot smuggle an arbitrary one into the key.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("user_id") as string;
  const certificationTypeName = formData.get(
    "certification_type_name",
  ) as string;
  const fileName = formData.get("file_name") as string;
  const contentType = formData.get("content_type") as string;

  if (!userId || !certificationTypeName || !fileName || !contentType) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  const fileExtension = ALLOWED_EXTENSIONS[contentType];
  if (!fileExtension) {
    return data(
      { error: "Invalid file type. Only PDF, JPG, and PNG are allowed." },
      { status: 400 },
    );
  }

  requireSelfOrAdmin(context, userId);

  try {
    const s3Helper = S3Helper.make();
    const certificationId = crypto.randomUUID();
    const timestamp = Date.now();
    const key = `files/certifications/${userId}/${certificationId}-${timestamp}.${fileExtension}`;

    const uploadUrl = await s3Helper.getPresignedUploadUrl(key, contentType);
    const fileUrl = s3Helper.getFileUrl(key);

    return data({
      uploadUrl,
      fileUrl,
      certificationId,
    });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    return data({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
