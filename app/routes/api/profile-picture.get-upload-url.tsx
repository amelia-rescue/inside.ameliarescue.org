import { data } from "react-router";
import type { Route } from "./+types/profile-picture.get-upload-url";
import { S3Helper } from "~/lib/s3-helper";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = formData.get("user_id") as string;
  const fileName = formData.get("file_name") as string;
  const contentType = formData.get("content_type") as string;

  if (!userId || !fileName || !contentType) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate content type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    return data(
      { error: "Invalid file type. Only JPG, PNG, and WebP are allowed." },
      { status: 400 },
    );
  }

  try {
    const s3Helper = S3Helper.make();
    const fileExtension = fileName.split(".").pop();
    const key = `files/profile-pictures/${userId}/profile.${fileExtension}`;

    const uploadUrl = await s3Helper.getPresignedUploadUrl(key, contentType);
    const fileUrl = s3Helper.getFileUrl(key);

    return data({
      uploadUrl,
      fileUrl,
    });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    return data({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
