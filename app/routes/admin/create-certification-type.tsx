import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/create-certification-type";
import { appContext } from "~/context";
import {
  certificationTypeSchema,
  CertificationTypeStore,
} from "~/lib/certification-type-store";
import { type } from "arktype";
import { IoWarning } from "react-icons/io5";

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
  const store = CertificationTypeStore.make();
  const certificationTypes = await store.listCertificationTypes();
  return { ...c, certificationTypes };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
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
    await store.createCertificationType(certificationType);
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message, formValues }, { status: 500 });
    }
    throw error;
  }

  return { success: true };
}

export default function CreateCertificationType({
  loaderData,
}: Route.ComponentProps) {
  const { certificationTypes } = loaderData;
  const fetcher = useFetcher<typeof action>();
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

          {fetcher.data &&
            "success" in fetcher.data &&
            fetcher.data.success && (
              <div className="alert alert-success mb-4">
                <span>Certification type created successfully!</span>
              </div>
            )}

          <fetcher.Form method="post" className="space-y-6">
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
                <li key={type.name} className="py-3">
                  <div className="font-medium">{type.name}</div>
                  <div className="text-base-content/70 text-sm">
                    {type.description}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
