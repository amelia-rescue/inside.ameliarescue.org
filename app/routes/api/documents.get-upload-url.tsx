import { data } from "react-router";
import type { Route } from "./+types/documents.get-upload-url";
import { S3Helper } from "~/lib/s3-helper";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const documentName = formData.get("document_name") as string;
  const fileName = formData.get("file_name") as string;
  const contentType = formData.get("content_type") as string;

  if (!documentName || !fileName || !contentType) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  const fileExtension = fileName.split(".").pop();
  if (!fileExtension) {
    return data({ error: "Missing file extension" }, { status: 400 });
  }

  const lowercasedName = documentName.trim().toLowerCase();
  if (!lowercasedName) {
    return data({ error: "Invalid document name" }, { status: 400 });
  }

  const allowedTypes = ["application/pdf"];

  if (!allowedTypes.includes(contentType)) {
    return data({ error: "Invalid file type" }, { status: 400 });
  }

  try {
    const s3Helper = S3Helper.make();
    const key = `files/documents/${lowercasedName}.${fileExtension.toLowerCase()}`;

    const uploadUrl = await s3Helper.getPresignedUploadUrl(key, contentType);
    const fileUrl = s3Helper.getFileUrl(key);

    return data({
      uploadUrl,
      fileUrl,
      key,
    });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    return data({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
