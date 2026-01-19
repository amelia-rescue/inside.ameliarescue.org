import { data, Link, useFetcher } from "react-router";
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
import { CertificationUpload } from "~/components/upload-certification";

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
    website_role: formData.get("website_website_role"),
    membership_role: formData.getAll("membership_role"),
  };

  if (
    formValues.membership_role.includes("junior") &&
    formValues.membership_role.length > 1
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
                <span className="label-text">website_role</span>
              </label>
              <select
                name="website_role"
                defaultValue={user.website_role}
                className="select select-bordered w-full"
                required
              >
                <option value="">Select a website_role</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Membership Status</span>
              </label>
              {/* TODO: Update this form to handle role-track assignments [{role_id, track_id}] */}
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_role"
                    value="provider"
                    defaultChecked={user.membership_role.some(
                      (m) => m.role_name === "Provider",
                    )}
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_role"]',
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
                    name="membership_role"
                    value="driver"
                    defaultChecked={user.membership_role.some(
                      (m) => m.role_name === "Driver",
                    )}
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_role"]',
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
                    name="membership_role"
                    value="junior"
                    defaultChecked={user.membership_role.some(
                      (m) => m.role_name === "Junior",
                    )}
                    className="checkbox"
                    required
                    onChange={(e) => {
                      const checkboxes = document.querySelectorAll(
                        'input[name="membership_role"]',
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
