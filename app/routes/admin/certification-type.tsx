import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/certification-type";
import { appContext } from "~/context";
import {
  certificationTypeSchema,
  CertificationTypeStore,
  type CertificationType,
} from "~/lib/certifications/certification-type-store";
import { type } from "arktype";
import { IoWarning } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Create Certification Type - Admin - Amelia Rescue" },
    { name: "description", content: "Create a new certification type" },
  ];
}

export const handle = {
  breadcrumb: "Create Certification Type",
};

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }

  // Check if user is admin
  if (c.user.website_role !== "admin") {
    throw redirect("/");
  }

  const store = CertificationTypeStore.make();
  const certificationTypes = await store.listCertificationTypes();
  return { ...c, certificationTypes };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const formValues = {
    name: formData.get("name"),
    description: formData.get("description"),
    expires: formData.get("expires") === "on",
  };

  const certificationType = certificationTypeSchema(formValues);
  if (certificationType instanceof type.errors) {
    return data(
      { error: certificationType.summary, formValues },
      { status: 400 },
    );
  }

  try {
    const store = CertificationTypeStore.make();
    if (intent === "update") {
      await store.updateCertificationType(certificationType);
    } else {
      await store.createCertificationType(certificationType);
    }
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message, formValues }, { status: 500 });
    }
    throw error;
  }

  return { success: true, intent };
}

export default function CreateCertificationType({
  loaderData,
}: Route.ComponentProps) {
  const { certificationTypes } = loaderData;
  certificationTypes.sort((a, b) => a.name.localeCompare(b.name));
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    if (
      fetcher.data &&
      "success" in fetcher.data &&
      fetcher.data.success === true &&
      fetcher.state === "idle"
    ) {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data, fetcher.state]);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">New Certification Type</h2>

          <div className="alert alert-warning mb-4">
            <IoWarning className="h-6 w-6 shrink-0" />
            <span>
              <strong>Warning:</strong> Certification types cannot be deleted
              once created. Please ensure the name and description are correct.
            </span>
          </div>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage &&
            !(
              fetcher.data &&
              "intent" in fetcher.data &&
              fetcher.data.intent === "update"
            ) && (
              <div className="alert alert-success mb-4">
                <span>Certification type created successfully!</span>
              </div>
            )}

          <fetcher.Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="create" />
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Name</span>
              </label>
              <input
                type="text"
                name="name"
                placeholder="EMT-Basic"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  The unique name for this certification type
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                name="description"
                placeholder="Emergency Medical Technician - Basic Level"
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  A brief description of this certification
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="expires"
                  className="checkbox"
                  defaultChecked
                />
                <span>This certification expires</span>
              </label>
            </div>

            <div className="card-actions justify-end pt-4">
              <Link to="/admin" className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-success">
                Create Certification Type
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">Existing Certification Types</h2>
          {certificationTypes.length === 0 ? (
            <p className="text-base-content/70">
              No certification types have been created yet.
            </p>
          ) : (
            <ul className="divide-base-300 divide-y">
              {certificationTypes.map((type) => (
                <li
                  key={type.name}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{type.name}</div>
                    <div className="text-base-content/70 text-sm">
                      {type.description}
                    </div>
                  </div>
                  <UpdateModal certificationType={type} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function UpdateModal(props: { certificationType: CertificationType }) {
  const { certificationType } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  function handleClick() {
    ref.current?.showModal();
  }

  useEffect(() => {
    if (
      fetcher.data &&
      "success" in fetcher.data &&
      fetcher.data.success === true &&
      "intent" in fetcher.data &&
      fetcher.data.intent === "update" &&
      fetcher.state === "idle"
    ) {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
        ref.current?.close();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <button className="btn btn-sm" onClick={handleClick}>
        Edit
      </button>
      <dialog ref={ref} className="modal">
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <h3 className="mb-4 text-lg font-bold">Update Certification Type</h3>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage && (
            <div className="alert alert-success mb-4">
              <span>Certification type updated successfully!</span>
            </div>
          )}

          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update" />

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Name</span>
              </label>
              <input
                type="text"
                name="name"
                defaultValue={certificationType.name}
                className="input input-bordered w-full cursor-not-allowed opacity-60"
                autoComplete="off"
                required
                readOnly
              />
              <label className="label">
                <span className="label-text-alt">Name cannot be changed</span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                name="description"
                defaultValue={certificationType.description}
                placeholder="Emergency Medical Technician - Basic Level"
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="expires"
                  className="checkbox"
                  defaultChecked={certificationType.expires}
                />
                <span>This certification expires</span>
              </label>
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => ref.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-success">
                {fetcher.state === "idle" ? (
                  "Update"
                ) : (
                  <span className="loading loading-spinner loading-xs"></span>
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </dialog>
    </>
  );
}
