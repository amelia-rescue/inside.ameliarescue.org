import { useFetcher, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/profile";
import { appContext } from "~/context";
import { useEffect, useState, useRef } from "react";
import { ArkErrors, type } from "arktype";
import { UserStore } from "~/lib/user-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "~/lib/certifications/certification-type-store";
import { CertificationStore } from "~/lib/certifications/certification-store";
import { TrackStore } from "~/lib/track-store";
import { RoleStore } from "~/lib/role-store";
import { CertificationUpload } from "~/components/upload-certification";
import { ProfilePictureUpload } from "~/components/profile-picture-upload";
import { CertificationReminderStore } from "~/lib/certifications/certification-reminder-store";

// todo: come up with a better name
async function getCertificationData(user_id: string) {
  const certificationTypeStore = CertificationTypeStore.make();
  const certificationStore = CertificationStore.make();
  const userStore = UserStore.make();
  const trackStore = TrackStore.make();
  const roleStore = RoleStore.make();

  const user = await userStore.getUser(user_id);

  const [certificationTypes, userCertifications, allTracks, allRoles] =
    await Promise.all([
      certificationTypeStore.listCertificationTypes(),
      certificationStore.listCertificationsByUser(user_id),
      trackStore.listTracks(),
      roleStore.listRoles(),
    ]);

  // Get all required certifications for user's role-track combinations
  const requiredCertNames = new Set<string>();
  for (const assignment of user.membership_roles) {
    const track = allTracks.find((t) => t.name === assignment.track_name);
    if (track) {
      track.required_certifications.forEach((certName) =>
        requiredCertNames.add(certName),
      );
    }
  }

  const certData = certificationTypes.map((certType) => {
    const existingCert = userCertifications.find(
      (cert) => cert.certification_type_name === certType.name,
    );

    // Calculate status
    let status: "active" | "expiring_soon" | "expired" | "missing" = "missing";
    if (existingCert && existingCert.expires_on) {
      const expiresOn = new Date(existingCert.expires_on);
      const now = new Date();
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

      if (expiresOn < now) {
        status = "expired";
      } else if (expiresOn < threeMonthsFromNow) {
        status = "expiring_soon";
      } else {
        status = "active";
      }
    } else if (existingCert) {
      // Has cert but no expiration date
      status = "active";
    }

    return {
      ...certType,
      existing_cert: existingCert,
      is_required: requiredCertNames.has(certType.name),
      status,
    };
  });

  // Sort: required certifications first, then alphabetically by name
  return certData.sort((a, b) => {
    if (a.is_required && !b.is_required) return -1;
    if (!a.is_required && b.is_required) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }
  const certificationReminderStore = CertificationReminderStore.make();
  const [certification_data, reminders] = await Promise.all([
    getCertificationData(ctx.user.user_id),
    certificationReminderStore.getRemindersByUser(ctx.user.user_id),
  ]);

  const sortedReminders = [...reminders].sort(
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
  );

  return { user: ctx.user, certification_data, reminders: sortedReminders };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }
  const formData = await request.formData();
  const contactUpdateSchema = type({
    phone: /^[\d\s\-\(\)\+]{1,20}$/,
  });
  const contact = contactUpdateSchema(Object.fromEntries(formData));
  if (contact instanceof ArkErrors) {
    return {
      errors: contact.summary,
    };
  }

  const store = UserStore.make();
  await store.updateUser({
    user_id: ctx.user.user_id,
    phone: contact.phone,
  });

  return { success: true };
}

export default function Profile() {
  const { user, certification_data, reminders } =
    useLoaderData<typeof loader>();
  const ref = useRef<HTMLDialogElement>(null);
  const certModalRef = useRef<HTMLDialogElement>(null);
  const profilePicModalRef = useRef<HTMLDialogElement>(null);
  const contactFetcher = useFetcher<typeof action>();
  const { success, errors } = contactFetcher.data || {};
  const [phoneValue, setPhoneValue] = useState(user.phone);
  const [selectedCertType, setSelectedCertType] =
    useState<CertificationType | null>(null);
  const [showProfilePicModal, setShowProfilePicModal] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) {
      return numbers;
    }
    if (numbers.length <= 6) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    }
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneValue(formatted);
  };

  useEffect(() => {
    if (success === true) {
      ref.current?.close();
    }
  }, [success, errors]);

  return (
    <>
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="avatar">
                <div className="ring-primary ring-offset-base-100 w-20 rounded-full ring ring-offset-2">
                  {user.profile_picture_url ? (
                    <img
                      src={user.profile_picture_url}
                      alt={`${user.first_name} ${user.last_name}`}
                    />
                  ) : (
                    <div className="bg-neutral text-neutral-content flex h-full w-full items-center justify-center">
                      <span className="text-3xl">
                        {user.first_name[0]}
                        {user.last_name[0]}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {user.first_name} {user.last_name}
                </h1>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => profilePicModalRef.current?.showModal()}
                >
                  {user.profile_picture_url ? "Change" : "Upload"} Photo
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {user.membership_roles.map((assignment, index) => (
                <span
                  key={index}
                  className={`badge ${
                    assignment.precepting ? "badge-warning" : "badge-primary"
                  }`}
                >
                  {assignment.role_name} - {assignment.track_name}
                  {assignment.precepting && " (Precepting)"}
                </span>
              ))}
            </div>
          </div>

          <div className="divider" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card bg-base-200">
              <div className="card-body">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="card-title text-base">Contact</h2>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => ref.current?.showModal()}
                  >
                    Update Contact
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Phone</dt>
                  <dd className="font-medium">{user.phone}</dd>
                  <dt className="opacity-70">Email</dt>
                  <dd className="font-medium">{user.email}</dd>
                </dl>
              </div>
            </div>

            <div className="card bg-base-200">
              <div className="card-body">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="card-title text-base">Membership</h2>
                  <Link
                    to="/account/security"
                    className="btn btn-sm btn-primary"
                  >
                    Account Security
                  </Link>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Website Role</dt>
                  <dd className="font-medium">{user.website_role}</dd>
                </dl>
              </div>
            </div>
          </div>

          <dialog
            ref={ref}
            id="update_contact_modal"
            className="modal modal-bottom sm:modal-middle"
          >
            <div className="modal-box">
              <h3 className="text-lg font-bold">Update Contact Information</h3>

              {errors && (
                <div className="alert alert-error mt-4">
                  <span>{errors}</span>
                </div>
              )}

              <contactFetcher.Form method="post" className="space-y-4 py-4">
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={phoneValue}
                    onChange={handlePhoneChange}
                    className="input input-bordered w-full"
                    placeholder="555-123-4567"
                    required
                  />
                </div>

                <div className="modal-action">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => ref.current?.close()}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={contactFetcher.state === "submitting"}
                    type="submit"
                    className="btn btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </contactFetcher.Form>
            </div>
          </dialog>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-1">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Certifications</h2>

            <div className="grid gap-3 sm:hidden">
              {certification_data.map((certType) => (
                <div key={certType.name} className="card bg-base-200">
                  <div className="card-body gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {certType.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {certType.is_required ? (
                            <span className="badge badge-sm badge-primary">
                              Required
                            </span>
                          ) : (
                            <span className="badge badge-sm badge-ghost">
                              Optional
                            </span>
                          )}

                          {certType.status === "active" ? (
                            <span className="badge badge-sm badge-success">
                              Active
                            </span>
                          ) : certType.status === "expiring_soon" ? (
                            <span className="badge badge-sm badge-warning">
                              Expiring Soon
                            </span>
                          ) : certType.status === "expired" ? (
                            <span className="badge badge-sm badge-error">
                              Expired
                            </span>
                          ) : (
                            <span className="badge badge-sm badge-ghost">
                              Missing
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {certType.existing_cert?.file_url ? (
                          <a
                            href={certType.existing_cert.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-xs btn-ghost"
                          >
                            View
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-xs btn-primary"
                          onClick={() => {
                            setSelectedCertType(certType);
                            certModalRef.current?.showModal();
                          }}
                        >
                          {certType.existing_cert ? "Update" : "Upload"}
                        </button>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="opacity-70">Issued</dt>
                      <dd className="font-medium">
                        {certType.existing_cert?.issued_on || "—"}
                      </dd>
                      <dt className="opacity-70">Expires</dt>
                      <dd className="font-medium">
                        {certType.existing_cert?.expires_on || "—"}
                      </dd>
                    </dl>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Required</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certification_data.map((certType) => {
                    const getStatusBadge = () => {
                      switch (certType.status) {
                        case "active":
                          return (
                            <span className="badge badge-sm badge-success">
                              Active
                            </span>
                          );
                        case "expiring_soon":
                          return (
                            <span className="badge badge-sm badge-warning">
                              Expiring Soon
                            </span>
                          );
                        case "expired":
                          return (
                            <span className="badge badge-sm badge-error">
                              Expired
                            </span>
                          );
                        case "missing":
                          return (
                            <span className="badge badge-sm badge-ghost">
                              Missing
                            </span>
                          );
                      }
                    };

                    return (
                      <tr key={certType.name}>
                        <td>{certType.name}</td>
                        <td>
                          {certType.is_required ? (
                            <span className="badge badge-sm badge-primary">
                              Required
                            </span>
                          ) : (
                            <span className="text-base-content/50">—</span>
                          )}
                        </td>
                        <td>{certType.existing_cert?.issued_on || "—"}</td>
                        <td>{certType.existing_cert?.expires_on || "—"}</td>
                        <td>{getStatusBadge()}</td>
                        <td>
                          {certType.existing_cert?.file_url ? (
                            <a
                              href={certType.existing_cert.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-xs btn-ghost"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-base-content/50">—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            onClick={() => {
                              setSelectedCertType(certType);
                              certModalRef.current?.showModal();
                            }}
                          >
                            {certType.existing_cert ? "Update" : "Upload"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Reminders Sent</h2>
            {reminders.length === 0 ? (
              <p className="py-4 text-center opacity-60">
                No reminders have been sent yet.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:hidden">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.reminder_id}
                      className="card bg-base-200"
                    >
                      <div className="card-body gap-2 p-4">
                        <div className="flex items-center justify-between">
                          <span
                            className={`badge badge-sm ${
                              reminder.reminder_type === "expired"
                                ? "badge-error"
                                : reminder.reminder_type === "expiring_soon"
                                  ? "badge-warning"
                                  : "badge-ghost"
                            }`}
                          >
                            {reminder.reminder_type === "expiring_soon"
                              ? "Expiring Soon"
                              : reminder.reminder_type.charAt(0).toUpperCase() +
                                reminder.reminder_type.slice(1)}
                          </span>
                          <span className="text-xs opacity-50">
                            {new Date(reminder.sent_at).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                        </div>
                        <p className="text-sm font-medium">
                          {reminder.certification_name}
                        </p>
                        <div className="flex gap-2">
                          {reminder.email_sent && (
                            <span className="badge badge-outline badge-xs">
                              Email
                            </span>
                          )}
                          {reminder.sms_sent && (
                            <span className="badge badge-outline badge-xs">
                              SMS
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Certification</th>
                        <th>Delivery</th>
                        <th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reminders.map((reminder) => (
                        <tr key={reminder.reminder_id}>
                          <td>
                            <span
                              className={`badge badge-sm ${
                                reminder.reminder_type === "expired"
                                  ? "badge-error"
                                  : reminder.reminder_type === "expiring_soon"
                                    ? "badge-warning"
                                    : "badge-ghost"
                              }`}
                            >
                              {reminder.reminder_type === "expiring_soon"
                                ? "Expiring Soon"
                                : reminder.reminder_type
                                    .charAt(0)
                                    .toUpperCase() +
                                  reminder.reminder_type.slice(1)}
                            </span>
                          </td>
                          <td>{reminder.certification_name}</td>
                          <td>
                            <div className="flex gap-1.5">
                              {reminder.email_sent && (
                                <span className="badge badge-outline badge-sm">
                                  Email
                                </span>
                              )}
                              {reminder.sms_sent && (
                                <span className="badge badge-outline badge-sm">
                                  SMS
                                </span>
                              )}
                              {!reminder.email_sent && !reminder.sms_sent && (
                                <span className="opacity-50">—</span>
                              )}
                            </div>
                          </td>
                          <td>
                            {new Date(reminder.sent_at).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <dialog
        ref={certModalRef}
        id="certification_upload_modal"
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box max-w-2xl">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          {selectedCertType && (
            <CertificationUpload
              userId={user.user_id}
              certificationType={selectedCertType}
            />
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <dialog
        ref={profilePicModalRef}
        id="profile_picture_modal"
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <h3 className="mb-4 text-lg font-bold">Upload Profile Picture</h3>
          <ProfilePictureUpload userId={user.user_id} />
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
