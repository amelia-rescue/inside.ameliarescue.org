import { S3Helper } from "~/lib/s3-helper";
import type { Route } from "./+types/documents";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { appContext } from "~/context";
import { useRef, useState } from "react";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No context found");
  }

  const s3 = S3Helper.make();
  const documents = await s3.listDocuments();
  return {
    documents: documents.sort((a, b) => a.name.localeCompare(b.name)),
    user: ctx.user,
  };
}

export async function action({ context }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No context found");
  }
  return { success: true };
}

export default function Documents() {
  const { documents, user } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentName, setDocumentName] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [documentToDelete, setDocumentToDelete] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const formatDocumentName = (name: string) => {
    const formattedName = name
      .replaceAll("-", " ")
      .replaceAll("_", " ")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");

    return formattedName.charAt(0).toUpperCase() + formattedName.slice(1);
  };

  const openUploadDialog = () => {
    setUploadError(undefined);
    setUploadSuccess(false);
    setDocumentName("");
    setIsReplacing(false);
    dialogRef.current?.showModal();
  };

  const openReplaceDialog = (name: string) => {
    setUploadError(undefined);
    setUploadSuccess(false);
    setDocumentName(name);
    setIsReplacing(true);
    dialogRef.current?.showModal();
  };

  const closeUploadDialog = () => {
    dialogRef.current?.close();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setDocumentName("");
    setIsReplacing(false);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    const name = documentName.trim();
    if (!name) {
      setUploadError("Please enter a document name");
      return;
    }
    if (!file) {
      setUploadError("Please select a file");
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadError("Only PDF files are allowed");
      return;
    }

    setUploading(true);
    setUploadError(undefined);
    setUploadSuccess(false);

    try {
      const urlFormData = new FormData();
      urlFormData.append("document_name", name);
      urlFormData.append("file_name", file.name);
      urlFormData.append("content_type", file.type);

      const urlResponse = await fetch("/api/documents/get-upload-url", {
        method: "POST",
        body: urlFormData,
      });

      if (!urlResponse.ok) {
        const payload = (await urlResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to get upload URL");
      }

      const { uploadUrl } = (await urlResponse.json()) as { uploadUrl: string };

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

      setUploadSuccess(true);
      setTimeout(() => {
        revalidator.revalidate();
        closeUploadDialog();
      }, 500);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openDeleteDialog = (doc: { key: string; name: string }) => {
    setDeleteError(undefined);
    setDocumentToDelete(doc);
    deleteDialogRef.current?.showModal();
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    setDeleting(true);
    setDeleteError(undefined);

    try {
      const formData = new FormData();
      formData.append("key", documentToDelete.key);

      const response = await fetch("/api/documents/delete", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to delete document");
      }

      revalidator.revalidate();
      deleteDialogRef.current?.close();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>Documents</li>
        </ul>
      </div>

      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h1 className="card-title text-2xl">Useful Documents</h1>
              <p className="text-sm opacity-70">They're all PDF format</p>
            </div>
            {user.website_role === "admin" && (
              <button
                type="button"
                className="btn btn-primary btn-sm w-full sm:w-auto"
                onClick={openUploadDialog}
              >
                Upload Document
              </button>
            )}
          </div>

          <div className="divider" />

          <dialog ref={dialogRef} className="modal">
            <div className="modal-box">
              <h3 className="text-lg font-bold">Upload Document</h3>
              <p>PDF file type is required</p>

              {uploadError && (
                <div className="alert alert-error mt-4">
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="alert alert-success mt-4">
                  <span>Document uploaded successfully!</span>
                </div>
              )}

              <div className="form-control mt-4 w-full">
                <label className="label">
                  <span className="label-text">Document name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  disabled={uploading || isReplacing}
                />
              </div>

              <div className="form-control mt-4 w-full">
                <label className="label">
                  <span className="label-text">File</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="file-input file-input-bordered w-full"
                  accept=".pdf"
                  disabled={uploading}
                />
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  className="btn"
                  onClick={closeUploadDialog}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    "Upload"
                  )}
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button onClick={closeUploadDialog} disabled={uploading}>
                close
              </button>
            </form>
          </dialog>

          <dialog ref={deleteDialogRef} className="modal">
            <div className="modal-box">
              <h3 className="text-lg font-bold">Delete this document?</h3>
              <p className="py-3">
                {documentToDelete && (
                  <strong>{formatDocumentName(documentToDelete.name)}</strong>
                )}{" "}
                will be removed for everyone. This action cannot be undone.
              </p>
              {deleteError && (
                <div className="alert alert-error">
                  <span>{deleteError}</span>
                </div>
              )}
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => deleteDialogRef.current?.close()}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-error"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  {deleting ? "Deleting..." : "Delete document"}
                </button>
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button disabled={deleting}>close</button>
            </form>
          </dialog>

          <div className="grid gap-4">
            {documents.map((doc) => (
              <div key={doc.key} className="card bg-base-200">
                <div className="card-body">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="card-title truncate text-lg">
                        {formatDocumentName(doc.name)}
                      </h2>
                    </div>
                    {doc.url ? (
                      <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:flex-nowrap">
                        <Link
                          to={`/documents/view?key=${encodeURIComponent(doc.key)}&name=${encodeURIComponent(doc.name)}`}
                          className="btn btn-primary btn-sm"
                        >
                          View
                        </Link>
                        {user.website_role === "admin" && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openReplaceDialog(doc.name)}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              className="btn btn-error btn-sm"
                              onClick={() => openDeleteDialog(doc)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-disabled">
                        Link Coming Soon
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
