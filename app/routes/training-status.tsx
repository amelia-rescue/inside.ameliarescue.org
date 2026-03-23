import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/training-status";
import { appContext } from "~/context";
import { useState, useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import {
  FaCheckCircle,
  FaArrowDown,
  FaArrowUp,
  FaExclamationTriangle,
  FaMinus,
  FaTimesCircle,
  FaMinusCircle,
  FaCalendarAlt,
  FaUsers,
} from "react-icons/fa";

type CertStatus = "active" | "expiring_soon" | "expired" | "missing";

type TrainingStatusRow = {
  user_id: string;
  name: string;
  roles: Array<{ label: string; precepting: boolean }>;
  certifications: Record<string, CertStatus>;
};

type TrainingStatusDashboardCallout = {
  title: string;
  value: string;
  description: string;
  tone: "success" | "warning" | "error" | "info";
};

type TrainingStatusRiskLeaderboardItem = {
  certificationType: string;
  totalRiskCount: number;
  missingCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  averageDaysToExpiration: number | null;
};

type TrainingStatusTrendPoint = {
  month: string;
  label: string;
  compliancePercentage: number;
  membersTracked: number;
  missingCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  atRiskCount: number;
  snapshotDate: string;
  source: "snapshot" | "live";
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
);

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const { loadTrainingStatusDashboardData } =
    await import("~/lib/certifications/training-status-dashboard.server");

  const {
    trainingData,
    certificationTypes,
    complianceStats,
    dashboardSummary,
    monthlyTrend,
    riskLeaderboard,
    dashboardCallouts,
  } = await loadTrainingStatusDashboardData();

  return {
    trainingData,
    certificationTypes,
    currentUserId: ctx.user.user_id,
    complianceStats,
    dashboardSummary,
    monthlyTrend,
    riskLeaderboard,
    dashboardCallouts,
  };
}

const columnHelper = createColumnHelper<TrainingStatusRow>();

function formatSnapshotDate(date: string | null) {
  if (!date) {
    return "No snapshots yet";
  }

  const formatted = new Date(date);
  if (Number.isNaN(formatted.getTime())) {
    return date;
  }

  return formatted.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSignedDelta(value: number | null) {
  if (value == null) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function CalloutCard({ callout }: { callout: TrainingStatusDashboardCallout }) {
  const className =
    callout.tone === "success"
      ? "alert-success"
      : callout.tone === "warning"
        ? "alert-warning"
        : callout.tone === "error"
          ? "alert-error"
          : "alert-info";

  return (
    <div className={`alert ${className} h-full items-start`}>
      <div>
        <div className="font-semibold">{callout.title}</div>
        <div className="text-lg font-bold">{callout.value}</div>
        <div className="text-sm opacity-80">{callout.description}</div>
      </div>
    </div>
  );
}

function ComplianceTrendChart({
  points,
}: {
  points: TrainingStatusTrendPoint[];
}) {
  if (points.length === 0) {
    return (
      <div className="text-base-content/60 flex h-64 items-center justify-center text-sm">
        Trend data will appear as snapshots accumulate.
      </div>
    );
  }

  const data = {
    labels: points.map((point) => point.label),
    datasets: [
      {
        label: "Compliance %",
        data: points.map((point) => point.compliancePercentage),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: points.map((point) =>
          point.source === "live"
            ? "rgba(168, 85, 247, 1)"
            : "rgba(59, 130, 246, 1)",
        ),
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `Compliance: ${context.parsed.y ?? 0}%`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: {
          callback: (value: string | number) => `${value}%`,
        },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Line data={data} options={options} />
    </div>
  );
}

function RiskTrendChart({ points }: { points: TrainingStatusTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="text-base-content/60 flex h-64 items-center justify-center text-sm">
        Risk trend data will appear as snapshots accumulate.
      </div>
    );
  }

  const data = {
    labels: points.map((point) => point.label),
    datasets: [
      {
        label: "Missing",
        data: points.map((point) => point.missingCount),
        backgroundColor: "rgba(239, 68, 68, 1)",
        stack: "risk",
      },
      {
        label: "Expired",
        data: points.map((point) => point.expiredCount),
        backgroundColor: "rgba(248, 113, 113, 1)",
        stack: "risk",
      },
      {
        label: "Expiring Soon",
        data: points.map((point) => point.expiringSoonCount),
        backgroundColor: "rgba(245, 158, 11, 1)",
        stack: "risk",
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Bar data={data} options={options} />
    </div>
  );
}

function RiskLeaderboard({
  items,
}: {
  items: TrainingStatusRiskLeaderboardItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="text-base-content/60 py-6 text-sm">
        No risk leaderboard data is available yet.
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="table-sm table w-full">
        <thead>
          <tr>
            <th>Certification</th>
            <th className="text-right">At Risk</th>
            <th className="text-right">Missing</th>
            <th className="text-right">Expired</th>
            <th className="text-right">Expiring Soon</th>
            <th className="text-right">Avg Days Left</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.certificationType}>
              <td className="max-w-0 font-medium break-words whitespace-normal">
                {item.certificationType}
              </td>
              <td className="text-right">{item.totalRiskCount}</td>
              <td className="text-right">{item.missingCount}</td>
              <td className="text-right">{item.expiredCount}</td>
              <td className="text-right">{item.expiringSoonCount}</td>
              <td className="text-right">
                {item.averageDaysToExpiration == null
                  ? "—"
                  : item.averageDaysToExpiration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TrainingStatus() {
  const {
    trainingData,
    certificationTypes,
    currentUserId,
    complianceStats,
    dashboardSummary,
    monthlyTrend,
    riskLeaderboard,
    dashboardCallouts,
  } = useLoaderData<typeof loader>();
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
          <div className="flex flex-col gap-1">
            {info.getValue().map((role, idx) => (
              <span
                key={idx}
                className={`badge badge-sm whitespace-nowrap ${
                  role.precepting ? "badge-warning" : "badge-primary"
                }`}
              >
                {role.label}
                {role.precepting && " (Precepting)"}
              </span>
            ))}
          </div>
        ),
        enableSorting: false,
      }),
      ...certificationTypes.map((certType: string) =>
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
            const icon =
              status === "active" ? (
                <FaCheckCircle />
              ) : status === "expiring_soon" ? (
                <FaExclamationTriangle />
              ) : status === "expired" ? (
                <FaTimesCircle />
              ) : (
                <FaMinusCircle />
              );
            return (
              <div className="flex justify-center">
                <span className={`badge ${badgeClass} badge-sm`}>{icon}</span>
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
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>Training Status</li>
        </ul>
      </div>

      <div className="card bg-base-100 shadow">
        <div className="card-body gap-6 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="card-title text-2xl">Training Status</h1>
              <p className="text-sm opacity-70">
                {trainingData.length} members tracked
              </p>
            </div>
          </div>

          <div className="divider my-0" />

          <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Member-level Detail</h2>
              <p className="text-sm opacity-70">
                Search and review member training status before diving into the
                dashboard summary.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
              <div className="form-control w-full lg:w-auto">
                <input
                  type="text"
                  placeholder="Search members..."
                  className="input input-bordered w-full lg:w-80"
                  value={globalFilter ?? ""}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                />
              </div>
              <a
                href="/api/training-status/export"
                className="btn btn-secondary w-full sm:w-auto"
              >
                Export to CSV
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="badge badge-success badge-sm">
                <FaCheckCircle />
              </span>
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-warning badge-sm">
                <FaExclamationTriangle />
              </span>
              <span>Expiring Soon</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-error badge-sm">
                <FaTimesCircle />
              </span>
              <span>Expired</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-error badge-sm">
                <FaMinusCircle />
              </span>
              <span>Missing</span>
            </div>
          </div>

          <div className="rounded-box border-base-300/60 w-full overflow-x-auto border">
            <table className="table-sm table w-full min-w-max">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-center whitespace-nowrap"
                      >
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
                      <td
                        key={cell.id}
                        className="text-center whitespace-nowrap"
                      >
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="stats bg-base-200 shadow-sm md:col-span-2 xl:col-span-1">
              <div className="stat">
                <div className="stat-figure text-success">
                  <FaCheckCircle className="text-2xl" />
                </div>
                <div className="stat-title">Overall Compliance</div>
                <div className="stat-value text-success text-3xl">
                  {dashboardSummary.overallCompliancePercentage}%
                </div>
                <div className="stat-desc">
                  {complianceStats.totalValidCerts} of{" "}
                  {complianceStats.totalRequiredCerts} required certs are valid
                </div>
              </div>
            </div>

            <div className="stats bg-base-200 shadow-sm">
              <div className="stat">
                <div className="stat-figure text-primary">
                  {dashboardSummary.complianceDeltaPercentagePoints == null ? (
                    <FaMinus className="text-2xl" />
                  ) : dashboardSummary.complianceDeltaPercentagePoints >= 0 ? (
                    <FaArrowUp className="text-2xl" />
                  ) : (
                    <FaArrowDown className="text-2xl" />
                  )}
                </div>
                <div className="stat-title">Month-over-Month</div>
                <div className="stat-value text-primary text-3xl">
                  {formatSignedDelta(
                    dashboardSummary.complianceDeltaPercentagePoints,
                  )}
                </div>
                <div className="stat-desc">
                  {dashboardSummary.trendMonths > 1
                    ? "Compared with the prior monthly point"
                    : "Waiting for more monthly history"}
                </div>
              </div>
            </div>

            <div className="stats bg-base-200 shadow-sm">
              <div className="stat">
                <div className="stat-figure text-error">
                  <FaExclamationTriangle className="text-2xl" />
                </div>
                <div className="stat-title">Required Certs At Risk</div>
                <div className="stat-value text-error text-3xl">
                  {dashboardSummary.requiredCertsAtRisk}
                </div>
                <div className="stat-desc">
                  {dashboardSummary.atRiskMembers} members have a missing,
                  expired, or expiring-soon required cert
                </div>
              </div>
            </div>

            <div className="stats bg-base-200 shadow-sm">
              <div className="stat">
                <div className="stat-figure text-info">
                  <FaUsers className="text-2xl" />
                </div>
                <div className="stat-title">Members Tracked</div>
                <div className="stat-value text-info text-3xl">
                  {dashboardSummary.membersTracked}
                </div>
                <div className="stat-desc flex items-center gap-2">
                  <FaCalendarAlt className="opacity-70" />
                  <span>
                    Latest snapshot:{" "}
                    {formatSnapshotDate(dashboardSummary.latestSnapshotDate)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {dashboardCallouts.map(
              (callout: TrainingStatusDashboardCallout) => (
                <CalloutCard key={callout.title} callout={callout} />
              ),
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="card-title text-lg">Compliance Trend</h2>
                    <p className="text-sm opacity-70">
                      Monthly overall compliance, using the latest snapshot
                      available for each month.
                    </p>
                  </div>
                  <span className="badge badge-primary badge-outline">
                    {monthlyTrend.length} months
                  </span>
                </div>
                <ComplianceTrendChart points={monthlyTrend} />
              </div>
            </div>

            <div className="card bg-base-200 shadow-sm">
              <div className="card-body">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="card-title text-lg">Risk Trend</h2>
                    <p className="text-sm opacity-70">
                      Missing, expired, and expiring-soon counts by month for a
                      quick meeting readout.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    <span className="badge badge-outline gap-2">
                      <span className="bg-error inline-block h-2 w-2 rounded-full" />{" "}
                      Missing
                    </span>
                    <span className="badge badge-outline gap-2">
                      <span className="bg-error/80 inline-block h-2 w-2 rounded-full" />{" "}
                      Expired
                    </span>
                    <span className="badge badge-outline gap-2">
                      <span className="bg-warning inline-block h-2 w-2 rounded-full" />{" "}
                      Expiring Soon
                    </span>
                  </div>
                </div>
                <RiskTrendChart points={monthlyTrend} />
              </div>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-3">
            <div className="card bg-base-200 min-w-0 shadow-sm xl:col-span-2">
              <div className="card-body min-w-0">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="card-title text-lg">Top Training Risks</h2>
                    <p className="text-sm opacity-70">
                      The most important certification types to discuss in the
                      monthly meeting.
                    </p>
                  </div>
                  <span className="badge badge-outline">
                    Top {riskLeaderboard.length}
                  </span>
                </div>
                <RiskLeaderboard items={riskLeaderboard} />
              </div>
            </div>

            <div className="card bg-base-200 min-w-0 shadow-sm xl:col-span-1">
              <div className="card-body min-w-0 gap-4">
                <h2 className="card-title text-lg">Current Risk Mix</h2>
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span>Missing required certs</span>
                      <span className="font-medium">
                        {dashboardSummary.requiredStatusCounts.missing}
                      </span>
                    </div>
                    <progress
                      className="progress progress-error w-full"
                      value={dashboardSummary.requiredStatusCounts.missing}
                      max={Math.max(dashboardSummary.requiredCertsAtRisk, 1)}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span>Expired required certs</span>
                      <span className="font-medium">
                        {dashboardSummary.requiredStatusCounts.expired}
                      </span>
                    </div>
                    <progress
                      className="progress progress-error w-full"
                      value={dashboardSummary.requiredStatusCounts.expired}
                      max={Math.max(dashboardSummary.requiredCertsAtRisk, 1)}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span>Expiring soon required certs</span>
                      <span className="font-medium">
                        {dashboardSummary.requiredStatusCounts.expiringSoon}
                      </span>
                    </div>
                    <progress
                      className="progress progress-warning w-full"
                      value={dashboardSummary.requiredStatusCounts.expiringSoon}
                      max={Math.max(dashboardSummary.requiredCertsAtRisk, 1)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
