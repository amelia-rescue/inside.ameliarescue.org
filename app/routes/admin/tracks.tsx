import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/tracks";
import { appContext } from "~/context";
import { trackSchema, TrackStore, type Track } from "~/lib/track-store";
import { CertificationTypeStore } from "~/lib/certification-type-store";
import { type } from "arktype";
import { IoWarning } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manage Tracks - Admin - Amelia Rescue" },
    { name: "description", content: "Create and manage certification tracks" },
  ];
}

export const handle = {
  breadcrumb: "Manage Tracks",
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

  const trackStore = TrackStore.make();
  const certificationTypeStore = CertificationTypeStore.make();
  const [tracks, certificationTypes] = await Promise.all([
    trackStore.listTracks(),
    certificationTypeStore.listCertificationTypes(),
  ]);
  return { ...c, tracks, certificationTypes };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const requiredCertifications = formData.getAll(
    "required_certifications",
  ) as string[];

  const formValues = {
    name: formData.get("name"),
    description: formData.get("description"),
    required_certifications: requiredCertifications,
  };

  const track = trackSchema(formValues);
  if (track instanceof type.errors) {
    return data({ error: track.summary, formValues }, { status: 400 });
  }

  try {
    const store = TrackStore.make();
    if (intent === "update") {
      await store.updateTrack(track);
    } else {
      await store.createTrack(track);
    }
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message, formValues }, { status: 500 });
    }
    throw error;
  }

  return { success: true, intent };
}

export default function ManageTracks({ loaderData }: Route.ComponentProps) {
  const { tracks, certificationTypes } = loaderData;
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
          <h2 className="card-title mb-4">New Track</h2>

          <div className="alert alert-warning mb-4">
            <IoWarning className="h-6 w-6 shrink-0" />
            <span>
              <strong>Warning:</strong> Tracks cannot be deleted once created.
              Please ensure the track ID, name, and description are correct.
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
                <span>Track created successfully!</span>
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
                placeholder="EMT"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  The display name for this track
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <textarea
                name="description"
                placeholder="Emergency Medical Technician certification track"
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  A brief description of this track
                </span>
              </label>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Required Certifications</span>
              </label>
              <div className="flex flex-col gap-2">
                {certificationTypes.length === 0 ? (
                  <p className="text-base-content/70 text-sm">
                    No certification types available. Create certification types
                    first.
                  </p>
                ) : (
                  certificationTypes.map(
                    (certType: {
                      name: string;
                      description: string;
                      expires: boolean;
                    }) => (
                      <label
                        key={certType.name}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          name="required_certifications"
                          value={certType.name}
                          className="checkbox checkbox-sm"
                        />
                        <span>
                          {certType.name} - {certType.description}
                        </span>
                      </label>
                    ),
                  )
                )}
              </div>
              <label className="label">
                <span className="label-text-alt">
                  Select which certifications are required for this track
                </span>
              </label>
            </div>

            <div className="card-actions justify-end pt-4">
              <Link to="/admin" className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-success">
                Create Track
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>

      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">Existing Tracks</h2>
          {tracks.length === 0 ? (
            <p className="text-base-content/70">
              No tracks have been created yet.
            </p>
          ) : (
            <ul className="divide-base-300 divide-y">
              {tracks.map((track: Track) => (
                <li
                  key={track.name}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{track.name}</div>
                    <div className="text-base-content/70 text-sm">
                      {track.description}
                    </div>
                    {track.required_certifications.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {track.required_certifications.map(
                          (certName: string) => {
                            const cert = certificationTypes.find(
                              (c: {
                                name: string;
                                description: string;
                                expires: boolean;
                              }) => c.name === certName,
                            );
                            return (
                              <span
                                key={certName}
                                className="badge badge-sm badge-secondary"
                              >
                                {cert?.name || certName}
                              </span>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>
                  <UpdateModal
                    track={track}
                    certificationTypes={certificationTypes}
                  />
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
  track: Track;
  certificationTypes: Array<{
    name: string;
    description: string;
    expires: boolean;
  }>;
}) {
  const { track, certificationTypes } = props;
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
          <h3 className="mb-4 text-lg font-bold">Update Track</h3>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage && (
            <div className="alert alert-success mb-4">
              <span>Track updated successfully!</span>
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
                defaultValue={track.name}
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
                defaultValue={track.description}
                className="textarea textarea-bordered w-full"
                rows={3}
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Required Certifications</span>
              </label>
              <div className="flex flex-col gap-2">
                {certificationTypes.length === 0 ? (
                  <p className="text-base-content/70 text-sm">
                    No certification types available.
                  </p>
                ) : (
                  certificationTypes.map(
                    (certType: {
                      name: string;
                      description: string;
                      expires: boolean;
                    }) => (
                      <label
                        key={certType.name}
                        className="flex cursor-pointer items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          name="required_certifications"
                          value={certType.name}
                          defaultChecked={track.required_certifications.includes(
                            certType.name,
                          )}
                          className="checkbox checkbox-sm"
                        />
                        <span>
                          {certType.name} - {certType.description}
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
