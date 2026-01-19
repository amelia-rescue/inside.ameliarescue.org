import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/roles";
import { appContext } from "~/context";
import { roleSchema, RoleStore, type Role } from "~/lib/role-store";
import { TrackStore } from "~/lib/track-store";
import { type } from "arktype";
import { IoWarning } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manage Roles - Admin - Amelia Rescue" },
    { name: "description", content: "Create and manage membership roles" },
  ];
}

export const handle = {
  breadcrumb: "Manage Roles",
};

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }
  const roleStore = RoleStore.make();
  const trackStore = TrackStore.make();
  const [roles, tracks] = await Promise.all([
    roleStore.listRoles(),
    trackStore.listTracks(),
  ]);
  return { ...c, roles, tracks };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const allowedTracks = formData.getAll("allowed_tracks") as string[];

  const formValues = {
    name: formData.get("name"),
    description: formData.get("description"),
    allowed_tracks: allowedTracks,
  };

  const role = roleSchema(formValues);
  if (role instanceof type.errors) {
    return data({ error: role.summary, formValues }, { status: 400 });
  }

  try {
    const store = RoleStore.make();
    if (intent === "update") {
      await store.updateRole(role);
    } else {
      await store.createRole(role);
    }
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message, formValues }, { status: 500 });
    }
    throw error;
  }

  return { success: true, intent };
}

export default function ManageRoles({ loaderData }: Route.ComponentProps) {
  const { roles, tracks } = loaderData;
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
          <h2 className="card-title mb-4">New Role</h2>

          <div className="alert alert-warning mb-4">
            <IoWarning className="h-6 w-6 shrink-0" />
            <span>
              <strong>Warning:</strong> Roles cannot be deleted once created.
              Please ensure the name and description are correct.
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
                <span>Role created successfully!</span>
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
                placeholder="Provider"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  The display name for this role
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                name="description"
                placeholder="Medical care provider on ambulance"
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  A brief description of this role
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Allowed Tracks</span>
              </label>
              <div className="flex flex-col gap-2">
                {tracks.length === 0 ? (
                  <p className="text-base-content/70 text-sm">
                    No tracks available. Create tracks first.
                  </p>
                ) : (
                  tracks.map(
                    (track: {
                      name: string;
                      description: string;
                      required_certifications: string[];
                    }) => (
                      <label
                        key={track.name}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          name="allowed_tracks"
                          value={track.name}
                          className="checkbox checkbox-sm"
                        />
                        <span>
                          {track.name} - {track.description}
                        </span>
                      </label>
                    ),
                  )
                )}
              </div>
              <label className="label">
                <span className="label-text-alt">
                  Select which tracks members with this role can be assigned to
                </span>
              </label>
            </div>

            <div className="card-actions justify-end pt-4">
              <Link to="/admin" className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-success">
                Create Role
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">Existing Roles</h2>
          {roles.length === 0 ? (
            <p className="text-base-content/70">
              No roles have been created yet.
            </p>
          ) : (
            <ul className="divide-base-300 divide-y">
              {roles.map((role: Role) => (
                <li
                  key={role.name}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{role.name}</div>
                    <div className="text-base-content/70 text-sm">
                      {role.description}
                    </div>
                    {role.allowed_tracks.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {role.allowed_tracks.map((trackName: string) => {
                          const track = tracks.find(
                            (t: {
                              name: string;
                              description: string;
                              required_certifications: string[];
                            }) => t.name === trackName,
                          );
                          return (
                            <span
                              key={trackName}
                              className="badge badge-sm badge-primary"
                            >
                              {track?.name || trackName}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <UpdateModal role={role} tracks={tracks} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function UpdateModal(props: {
  role: Role;
  tracks: Array<{
    name: string;
    description: string;
    required_certifications: string[];
  }>;
}) {
  const { role, tracks } = props;
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
          <h3 className="mb-4 text-lg font-bold">Update Role</h3>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage && (
            <div className="alert alert-success mb-4">
              <span>Role updated successfully!</span>
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
                defaultValue={role.name}
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                name="description"
                defaultValue={role.description}
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Allowed Tracks</span>
              </label>
              <div className="flex flex-col gap-2">
                {tracks.length === 0 ? (
                  <p className="text-base-content/70 text-sm">
                    No tracks available.
                  </p>
                ) : (
                  tracks.map(
                    (track: {
                      name: string;
                      description: string;
                      required_certifications: string[];
                    }) => (
                      <label
                        key={track.name}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          name="allowed_tracks"
                          value={track.name}
                          defaultChecked={role.allowed_tracks.includes(
                            track.name,
                          )}
                          className="checkbox checkbox-sm"
                        />
                        <span>
                          {track.name} - {track.description}
                        </span>
                      </label>
                    ),
                  )
                )}
              </div>
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
