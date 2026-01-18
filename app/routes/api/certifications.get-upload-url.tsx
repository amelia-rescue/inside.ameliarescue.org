import { data } from "react-router";
import type { Route } from "./+types/certifications.get-upload-url";
import { S3Helper } from "~/lib/s3-helper";

export async function action({ request }: Route.ActionArgs) {
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

  try {
    const s3Helper = S3Helper.make();
    const certificationId = crypto.randomUUID();
    const timestamp = Date.now();
    const fileExtension = fileName.split(".").pop();
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
