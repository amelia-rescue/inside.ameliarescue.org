import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/update-user";
import { appContext } from "~/context";
import { userSchema, UserStore } from "~/lib/user-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "~/lib/certification-type-store";
import { type } from "arktype";
import { useEffect, useRef, useState } from "react";
import { CertificationStore } from "~/lib/certification-store";
import { FiExternalLink } from "react-icons/fi";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Update User - Admin - Amelia Rescue" },
    { name: "description", content: "Update user information" },
  ];
}

export const handle = {
  breadcrumb: "Update User",
};

export async function loader({ context, params }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }

  const store = UserStore.make();
  const user = await store.getUser(params.user_id);

  const tableData = await getTableData(user.user_id);

  return { ...c, user, tableData };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const formValues = {
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    membership_status: formData.getAll("membership_status"),
    certification_level: formData.get("certification_level"),
  };

  if (
    formValues.membership_status.includes("junior") &&
    formValues.membership_status.length > 1
  ) {
    return data(
      {
        success: false,
        error: "Junior members cannot be providers or drivers",
      },
      { status: 400 },
    );
  }

  const store = UserStore.make();
  const existingUser = await store.getUser(params.user_id);

  const user = userSchema({
    user_id: params.user_id,
    email: existingUser.email,
    ...formValues,
  });

  if (user instanceof type.errors) {
    return data(
      { success: false, error: user.summary, formValues },
      { status: 400 },
    );
  }

  try {
    await store.updateUser(user);
  } catch (error) {
    if (error instanceof Error) {
      return data(
        { success: false, error: error.message, formValues },
        { status: 500 },
      );
    }
    throw error;
  }

  return { success: true };
}

export default function UpdateUser({ loaderData }: Route.ComponentProps) {
  const { user, tableData } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success === true && fetcher.state === "idle") {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data?.success, fetcher.state]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">Update User Information</h2>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage && (
            <div className="alert alert-success mb-4">
              <span>User updated successfully!</span>
            </div>
          )}

          <fetcher.Form method="post" className="space-y-6">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Email</span>
              </label>
              <input
                type="email"
                name="email"
                defaultValue={user.email}
                placeholder="user@ameliarescue.org"
                className="input input-bordered w-full cursor-not-allowed opacity-60"
                autoComplete="off"
                required
                readOnly
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">First Name</span>
              </label>
              <input
                type="text"
                name="first_name"
                defaultValue={user.first_name}
                placeholder="John"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Last Name</span>
              </label>
              <input
                type="text"
                name="last_name"
                defaultValue={user.last_name}
                placeholder="Doe"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Role</span>
              </label>
              <select
                name="role"
                defaultValue={user.role}
                className="select select-bordered w-full"
                required
              >
                <option value="">Select a role</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Membership Status</span>
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="provider"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("provider")
                        : user.membership_status === "provider"
                    }
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_status"]',
                      ) as NodeListOf<HTMLInputElement>;
                      const isAnyChecked = Array.from(checkboxes).some(
                        (cb) => cb.checked,
                      );
                      checkboxes.forEach((cb) => {
                        cb.required = !isAnyChecked;
                      });
                    }}
                  />
                  <span>Provider</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="driver"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("driver")
                        : user.membership_status === "driver"
                    }
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_status"]',
                      ) as NodeListOf<HTMLInputElement>;
                      const isAnyChecked = Array.from(checkboxes).some(
                        (cb) => cb.checked,
                      );
                      checkboxes.forEach((cb) => {
                        cb.required = !isAnyChecked;
                      });
                    }}
                  />
                  <span>Driver</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="junior"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("junior")
                        : user.membership_status === "junior"
                    }
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_status"]',
                      ) as NodeListOf<HTMLInputElement>;
                      const isAnyChecked = Array.from(checkboxes).some(
                        (cb) => cb.checked,
                      );
                      checkboxes.forEach((cb) => {
                        cb.required = !isAnyChecked;
                      });
                    }}
                  />
                  <span>Junior</span>
                </label>
              </div>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Certification Level</span>
              </label>
              <select
                name="certification_level"
                defaultValue={user.certification_level}
                className="select select-bordered w-full"
                required
              >
                <option value="">Select certification level</option>
                <option value="cpr">CPR</option>
                <option value="basic">Basic</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="paramedic">Paramedic</option>
              </select>
            </div>

            <div className="card-actions justify-end pt-4">
              <Link to="/admin" className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-success">
                {fetcher.state === "idle" ? (
                  "Update User"
                ) : (
                  <span className="loading loading-spinner loading-xs"></span>
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>

      <div className="rounded-box border-base-content/5 bg-base-100 mt-6 overflow-x-auto border">
        <table className="table">
          <thead>
            <tr>
              <th>Certification</th>
              <th>Description</th>
              <th>Uploaded Document</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((certType) => (
              <tr key={certType.name}>
                <td>{certType.name}</td>
                <td>{certType.description}</td>
                <td>
                  {certType.existing_cert?.file_url ? (
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={certType.existing_cert.file_url}
                      className="inline-flex items-center gap-1"
                    >
                      View <FiExternalLink className="inline" />
                    </a>
                  ) : (
                    "Not uploaded"
                  )}
                </td>
                <td>
                  {certType.existing_cert?.file_url ? (
                    <UploadModal
                      buttonText="Replace"
                      certType={certType}
                      userId={user.user_id}
                    />
                  ) : (
                    <UploadModal
                      buttonText="Upload"
                      certType={certType}
                      userId={user.user_id}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadModal(props: {
  buttonText: string;
  certType: CertificationType;
  userId: string;
}) {
  const { buttonText, certType, userId } = props;
  const ref = useRef<HTMLDialogElement>(null);
  function handleClick() {
    ref.current?.showModal();
  }

  return (
    <>
      <button className="btn" onClick={handleClick}>
        {buttonText}
      </button>
      <dialog ref={ref} className="modal">
        <div className="modal-box">
          <form method="dialog">
            {/* if there is a button in form, it will close the modal */}
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <h3 className="text-lg font-bold">Certification Upload</h3>
          <CertificationUpload
            key={certType.name}
            userId={userId}
            certificationType={certType}
          />
        </div>
      </dialog>
    </>
  );
}

async function getTableData(user_id: string) {
  const certificationTypeStore = CertificationTypeStore.make();
  const certificationStore = CertificationStore.make();
  const [certificationTypes, userCertifications] = await Promise.all([
    certificationTypeStore.listCertificationTypes(),
    certificationStore.listCertificationsByUser(user_id),
  ]);

  return certificationTypes.map((certType) => {
    const existingCert = userCertifications.find(
      (cert) => cert.certification_type_name === certType.name,
    );
    return {
      ...certType,
      existing_cert: existingCert,
    };
  });
}

function CertificationUpload({
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
                <span className="label-text">Expiration Date</span>
              </label>
              <input
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
