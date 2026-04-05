import { data } from "react-router";
import type { Route } from "./+types/truck-check-images.get-upload-url";
import { S3Helper } from "~/lib/s3-helper";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFileExtension(fileName: string, contentType: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension) return extension;

  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "img";
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const truckCheckId = formData.get("truck_check_id") as string;
  const fieldId = formData.get("field_id") as string;
  const fileName = formData.get("file_name") as string;
  const contentType = formData.get("content_type") as string;

  if (!truckCheckId || !fieldId || !fileName || !contentType) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return data(
      { error: "Invalid file type. Only JPG, PNG, WebP, and GIF are allowed." },
      { status: 400 },
    );
  }

  try {
    const s3Helper = S3Helper.make();
    const safeTruckCheckId = sanitizePathSegment(truckCheckId);
    const safeFieldId = sanitizePathSegment(fieldId);
    const fileExtension = getFileExtension(fileName, contentType);
    const key = `files/truck-check-images/${safeTruckCheckId}/${safeFieldId}/${crypto.randomUUID()}.${fileExtension}`;

    const uploadUrl = await s3Helper.getPresignedUploadUrl(key, contentType);
    const fileUrl = s3Helper.getFileUrl(key);

    return data({
      uploadUrl,
      fileUrl,
      key,
    });
  } catch (error) {
    console.error("Error generating truck-check image upload URL:", error);
    return data(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
