import { useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/user.$user_id";
import { appContext } from "~/context";
import { UserStore } from "~/lib/user-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "~/lib/certification-type-store";
import { CertificationStore } from "~/lib/certification-store";
import { TrackStore } from "~/lib/track-store";
import { RoleStore } from "~/lib/role-store";

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

export async function loader({ params, context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const userId = params.user_id;

  // If viewing own profile, redirect to /profile
  if (userId === ctx.user.user_id) {
    throw redirect("/profile");
  }

  const userStore = UserStore.make();
  const user = await userStore.getUser(userId);
  const certification_data = await getCertificationData(userId);

  return { user, certification_data };
}

export default function User() {
  const { user, certification_data } = useLoaderData<typeof loader>();

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
                <h2 className="card-title text-base">Contact</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Phone</dt>
                  <dd className="font-medium">{user.phone || "—"}</dd>
                  <dt className="opacity-70">Email</dt>
                  <dd className="font-medium">{user.email}</dd>
                </dl>
              </div>
            </div>

            <div className="card bg-base-200">
              <div className="card-body">
                <h2 className="card-title text-base">Membership</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Website Role</dt>
                  <dd className="font-medium">{user.website_role}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-1">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Certifications</h2>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Required</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {certification_data.map((certType) => {
                    const getStatusBadge = () => {
                      switch (certType.status) {
                        case "active":
                          return (
                            <span className="badge badge-success">Active</span>
                          );
                        case "expiring_soon":
                          return (
                            <span className="badge badge-warning">
                              Expiring Soon
                            </span>
                          );
                        case "expired":
                          return (
                            <span className="badge badge-error">Expired</span>
                          );
                        case "missing":
                          return (
                            <span className="badge badge-ghost">Missing</span>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
