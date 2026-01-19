import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/training-status";
import { UserStore } from "~/lib/user-store";
import { TrackStore } from "~/lib/track-store";
import { CertificationTypeStore } from "~/lib/certification-type-store";
import { CertificationStore } from "~/lib/certification-store";
import { appContext } from "~/context";
import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";

type CertStatus = "active" | "expiring_soon" | "expired" | "missing";

interface TrainingStatusRow {
  user_id: string;
  name: string;
  roles: string[];
  certifications: Record<string, CertStatus>;
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const userStore = UserStore.make();
  const trackStore = TrackStore.make();
  const certTypeStore = CertificationTypeStore.make();
  const certStore = CertificationStore.make();

  const [users, tracks, certTypes] = await Promise.all([
    userStore.listUsers(),
    trackStore.listTracks(),
    certTypeStore.listCertificationTypes(),
  ]);

  // Get all certifications for all users
  const allCertifications = await Promise.all(
    users.map((user) => certStore.listCertificationsByUser(user.user_id)),
  );

  // Build training status data
  const trainingData: TrainingStatusRow[] = users.map((user, userIndex) => {
    const userCerts = allCertifications[userIndex];

    // Get all required certifications for this user's roles
    const requiredCertNames = new Set<string>();
    for (const assignment of user.membership_roles) {
      const track = tracks.find((t) => t.name === assignment.track_name);
      if (track) {
        track.required_certifications.forEach((certName) =>
          requiredCertNames.add(certName),
        );
      }
    }

    // Calculate status for each required certification
    const certifications: Record<string, CertStatus> = {};
    requiredCertNames.forEach((certName) => {
      const userCert = userCerts.find(
        (cert) => cert.certification_type_name === certName,
      );

      if (!userCert) {
        certifications[certName] = "missing";
      } else if (userCert.expires_on) {
        const expiresOn = new Date(userCert.expires_on);
        const now = new Date();
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

        if (expiresOn < now) {
          certifications[certName] = "expired";
        } else if (expiresOn < threeMonthsFromNow) {
          certifications[certName] = "expiring_soon";
        } else {
          certifications[certName] = "active";
        }
      } else {
        certifications[certName] = "active";
      }
    });

    return {
      user_id: user.user_id,
      name: `${user.first_name} ${user.last_name}`,
      roles: user.membership_roles.map(
        (r) => `${r.role_name} - ${r.track_name}`,
      ),
      certifications,
    };
  });

  // Get unique list of all required certifications across all users
  const allRequiredCerts = new Set<string>();
  trainingData.forEach((row) => {
    Object.keys(row.certifications).forEach((cert) =>
      allRequiredCerts.add(cert),
    );
  });

  return {
    trainingData,
    certificationTypes: Array.from(allRequiredCerts).sort(),
    currentUserId: ctx.user.user_id,
  };
}

const columnHelper = createColumnHelper<TrainingStatusRow>();

export default function TrainingStatus() {
  const { trainingData, certificationTypes, currentUserId } =
    useLoaderData<typeof loader>();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => {
          const userId = info.row.original.user_id;
          const linkTo =
            userId === currentUserId ? "/profile" : `/user/${userId}`;
          return (
            <Link to={linkTo} className="font-medium hover:underline">
              {info.getValue()}
            </Link>
          );
        },
      }),
      columnHelper.accessor("roles", {
        header: "Roles",
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            {info.getValue().map((role, idx) => (
              <span key={idx} className="badge badge-primary badge-sm">
                {role}
              </span>
            ))}
          </div>
        ),
        enableSorting: false,
      }),
      ...certificationTypes.map((certType) =>
        columnHelper.accessor((row) => row.certifications[certType], {
          id: certType,
          header: certType,
          cell: (info) => {
            const status = info.getValue() as CertStatus | undefined;

            // If this certification is not required for this user, show nothing
            if (!status) {
              return <span className="text-base-content/20">—</span>;
            }

            const badgeClass =
              status === "active"
                ? "badge-success"
                : status === "expiring_soon"
                  ? "badge-warning"
                  : status === "expired"
                    ? "badge-error"
                    : "badge-error"; // missing is also red/error
            const label =
              status === "active"
                ? "✓"
                : status === "expiring_soon"
                  ? "⚠"
                  : status === "expired"
                    ? "✗"
                    : "—";
            return (
              <div className="flex justify-center">
                <span className={`badge ${badgeClass} badge-sm`}>{label}</span>
              </div>
            );
          },
        }),
      ),
    ],
    [certificationTypes, currentUserId],
  );

  const table = useReactTable({
    data: trainingData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="card-title text-2xl">Training Status</h1>
            <p className="text-sm opacity-70">
              {trainingData.length} members tracked
            </p>
          </div>

          <div className="form-control w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search members..."
              className="input input-bordered w-full sm:w-64"
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="divider" />

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="badge badge-success badge-sm">✓</span>
            <span>Active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-warning badge-sm">⚠</span>
            <span>Expiring Soon</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-error badge-sm">✗</span>
            <span>Expired</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-error badge-sm">—</span>
            <span>Missing</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="text-center">
                      {header.isPlaceholder ? null : (
                        <div
                          className={
                            header.column.getCanSort()
                              ? "flex cursor-pointer items-center justify-center gap-1 select-none"
                              : "flex items-center justify-center"
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <span className="text-xs opacity-50">
                              {{
                                asc: "↑",
                                desc: "↓",
                              }[header.column.getIsSorted() as string] ?? "↕"}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="text-center">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.getRowModel().rows.length === 0 && (
          <div className="text-base-content/50 py-8 text-center">
            No members found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
