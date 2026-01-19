import { useState } from "react";
import type { CertificationType } from "~/lib/certification-type-store";

export function CertificationUpload({
  userId,
  certificationType,
}: {
  userId: string;
  certificationType: CertificationType;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(undefined);
    setUploadSuccess(false);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File;

    if (!file) {
      setUploadError("Please select a file");
      setUploading(false);
      return;
    }

    try {
      // Step 1: Get pre-signed URL
      const urlFormData = new FormData();
      urlFormData.append("user_id", userId);
      urlFormData.append("certification_type_name", certificationType.name);
      urlFormData.append("file_name", file.name);
      urlFormData.append("content_type", file.type);

      const urlResponse = await fetch("/api/certifications/get-upload-url", {
        method: "POST",
        body: urlFormData,
      });

      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, fileUrl, certificationId } = await urlResponse.json();

      // Step 2: Upload file to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      // Step 3: Save certification record
      const saveFormData = new FormData();
      saveFormData.append("certification_id", certificationId);
      saveFormData.append("user_id", userId);
      saveFormData.append("certification_type_name", certificationType.name);
      saveFormData.append("file_url", fileUrl);
      saveFormData.append("expires_on", formData.get("expires_on") as string);
      saveFormData.append("issued_on", formData.get("issued_on") as string);

      const saveResponse = await fetch("/api/certifications/save", {
        method: "POST",
        body: saveFormData,
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save certification");
      }

      setUploadSuccess(true);
      form.reset();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-lg">
      <div className="card-body">
        <h2 className="card-title mb-4">{certificationType.name}</h2>
        <p className="text-base-content/70 mb-4 text-sm">
          {certificationType.description}
        </p>

        {uploadError && (
          <div className="alert alert-error mb-4">
            <span>{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="alert alert-success mb-4">
            <span>Certification uploaded successfully!</span>
          </div>
        )}

        <form onSubmit={handleFileUpload} className="space-y-6">
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">File</span>
            </label>
            <input
              type="file"
              name="file"
              className="file-input file-input-bordered w-full"
              accept=".pdf,.jpg,.jpeg,.png"
              required
              disabled={uploading}
            />
          </div>

          {certificationType.expires === true && (
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Issued Date</span>
              </label>
              <input
                required
                type="date"
                name="issued_on"
                className="input input-bordered w-full"
                disabled={uploading}
              />
            </div>
          )}

          {certificationType.expires === true && (
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Expiration Date</span>
              </label>
              <input
                required
                type="date"
                name="expires_on"
                className="input input-bordered w-full"
                disabled={uploading}
              />
            </div>
          )}

          <div className="card-actions justify-end">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading}
            >
              {uploading ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                "Upload Certification"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
