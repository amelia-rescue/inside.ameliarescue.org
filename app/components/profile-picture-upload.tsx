import { useState, useRef } from "react";

export function ProfilePictureUpload({ userId }: { userId: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be less than 5MB");
      return;
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only JPG, PNG, and WebP files are allowed");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    setUploadError(undefined);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("Please select a file");
      return;
    }

    setUploading(true);
    setUploadError(undefined);
    setUploadSuccess(false);

    try {
      // Step 1: Get pre-signed URL
      const urlFormData = new FormData();
      urlFormData.append("user_id", userId);
      urlFormData.append("file_name", file.name);
      urlFormData.append("content_type", file.type);

      const urlResponse = await fetch("/api/profile-picture/get-upload-url", {
        method: "POST",
        body: urlFormData,
      });

      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, fileUrl } = await urlResponse.json();

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

      // Step 3: Save profile picture URL
      const saveFormData = new FormData();
      saveFormData.append("user_id", userId);
      saveFormData.append("file_url", fileUrl);

      const saveResponse = await fetch("/api/profile-picture/save", {
        method: "POST",
        body: saveFormData,
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save profile picture");
      }

      setUploadSuccess(true);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Reload page to show new profile picture
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {uploadError && (
        <div className="alert alert-error">
          <span>{uploadError}</span>
        </div>
      )}

      {uploadSuccess && (
        <div className="alert alert-success">
          <span>Profile picture updated successfully!</span>
        </div>
      )}

      <div className="form-control w-full">
        <label className="label">
          <span className="label-text">Select Profile Picture</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          className="file-input file-input-bordered w-full"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <label className="label">
          <span className="label-text-alt">
            JPG, PNG, or WebP. Max 5MB. Square images work best.
          </span>
        </label>
      </div>

      {previewUrl && (
        <div className="flex justify-center">
          <div className="avatar">
            <div className="ring-primary ring-offset-base-100 w-32 rounded-full ring ring-offset-2">
              <img src={previewUrl} alt="Preview" />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={uploading || !previewUrl}
        >
          {uploading ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Uploading...
            </>
          ) : (
            "Upload Profile Picture"
          )}
        </button>
      </div>
    </div>
  );
}
