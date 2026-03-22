import dayjs from "dayjs";
import type { CertificationSnapshot } from "./certification-snapshot-store";
import type {
  CertStatus,
  TrainingStatusData,
  TrainingStatusExportRow,
} from "./training-status-export";

export interface TrainingStatusDashboardStatusCounts {
  active: number;
  expiringSoon: number;
  expired: number;
  missing: number;
}

export interface TrainingStatusDashboardSummary {
  membersTracked: number;
  atRiskMembers: number;
  requiredCertsAtRisk: number;
  overallCompliancePercentage: number;
  complianceDeltaPercentagePoints: number | null;
  latestSnapshotDate: string | null;
  trendMonths: number;
  requiredStatusCounts: TrainingStatusDashboardStatusCounts;
}

export interface TrainingStatusTrendPoint {
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
}

export interface TrainingStatusRiskLeaderboardItem {
  certificationType: string;
  totalRiskCount: number;
  missingCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  averageDaysToExpiration: number | null;
}

export interface TrainingStatusDashboardCallout {
  title: string;
  value: string;
  description: string;
  tone: "success" | "warning" | "error" | "info";
}

export interface TrainingStatusDashboardData extends TrainingStatusData {
  dashboardSummary: TrainingStatusDashboardSummary;
  monthlyTrend: TrainingStatusTrendPoint[];
  riskLeaderboard: TrainingStatusRiskLeaderboardItem[];
  dashboardCallouts: TrainingStatusDashboardCallout[];
}

interface BuildTrainingStatusDashboardDataParams {
  currentData: TrainingStatusData;
  snapshots: CertificationSnapshot[];
  now?: Date;
}

function createEmptyStatusCounts(): TrainingStatusDashboardStatusCounts {
  return {
    active: 0,
    expiringSoon: 0,
    expired: 0,
    missing: 0,
  };
}

function accumulateStatus(
  counts: TrainingStatusDashboardStatusCounts,
  status: CertStatus,
) {
  if (status === "expiring_soon") {
    counts.expiringSoon += 1;
    return;
  }

  counts[status] += 1;
}

function buildRequiredStatusCounts(
  exportRows: TrainingStatusExportRow[],
): TrainingStatusDashboardStatusCounts {
  return exportRows.reduce((counts, row) => {
    if (!row.required) {
      return counts;
    }

    accumulateStatus(counts, row.status);
    return counts;
  }, createEmptyStatusCounts());
}

function buildLiveTrendStatusCounts(
  exportRows: TrainingStatusExportRow[],
): TrainingStatusDashboardStatusCounts {
  return exportRows.reduce((counts, row) => {
    if (row.status === "missing") {
      if (row.required) {
        counts.missing += 1;
      }
      return counts;
    }

    if (!row.file_url) {
      return counts;
    }

    accumulateStatus(counts, row.status);
    return counts;
  }, createEmptyStatusCounts());
}

function buildRiskLeaderboard(
  exportRows: TrainingStatusExportRow[],
): TrainingStatusRiskLeaderboardItem[] {
  const leaderboard = new Map<
    string,
    {
      certificationType: string;
      totalRiskCount: number;
      missingCount: number;
      expiredCount: number;
      expiringSoonCount: number;
      expirationDayValues: number[];
    }
  >();

  exportRows.forEach((row) => {
    if (!row.required) {
      return;
    }

    const item = leaderboard.get(row.certification_type) ?? {
      certificationType: row.certification_type,
      totalRiskCount: 0,
      missingCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      expirationDayValues: [],
    };

    if (row.status !== "active") {
      item.totalRiskCount += 1;
    }

    if (row.status === "missing") {
      item.missingCount += 1;
    }

    if (row.status === "expired") {
      item.expiredCount += 1;
    }

    if (row.status === "expiring_soon") {
      item.expiringSoonCount += 1;
    }

    if (
      row.expires_on &&
      (row.status === "active" || row.status === "expiring_soon")
    ) {
      const expiresOn = dayjs(row.expires_on);
      if (expiresOn.isValid()) {
        item.expirationDayValues.push(expiresOn.diff(dayjs(), "days"));
      }
    }

    leaderboard.set(row.certification_type, item);
  });

  return Array.from(leaderboard.values())
    .map((item) => ({
      certificationType: item.certificationType,
      totalRiskCount: item.totalRiskCount,
      missingCount: item.missingCount,
      expiredCount: item.expiredCount,
      expiringSoonCount: item.expiringSoonCount,
      averageDaysToExpiration:
        item.expirationDayValues.length > 0
          ? Math.round(
              item.expirationDayValues.reduce((sum, days) => sum + days, 0) /
                item.expirationDayValues.length,
            )
          : null,
    }))
    .sort((a, b) => {
      if (b.totalRiskCount !== a.totalRiskCount) {
        return b.totalRiskCount - a.totalRiskCount;
      }

      if (b.missingCount !== a.missingCount) {
        return b.missingCount - a.missingCount;
      }

      if (b.expiredCount !== a.expiredCount) {
        return b.expiredCount - a.expiredCount;
      }

      if (b.expiringSoonCount !== a.expiringSoonCount) {
        return b.expiringSoonCount - a.expiringSoonCount;
      }

      return a.certificationType.localeCompare(b.certificationType);
    });
}

function buildTrendPointFromSnapshot(
  snapshot: CertificationSnapshot,
): TrainingStatusTrendPoint {
  const missingCount = snapshot.cert_type_stats.reduce(
    (sum, stat) => sum + stat.missing_count,
    0,
  );
  const expiredCount = snapshot.cert_type_stats.reduce(
    (sum, stat) => sum + stat.expired_count,
    0,
  );
  const expiringSoonCount = snapshot.cert_type_stats.reduce(
    (sum, stat) => sum + stat.expiring_soon_count,
    0,
  );
  const monthDate = dayjs(snapshot.snapshot_date);

  return {
    month: monthDate.format("YYYY-MM"),
    label: monthDate.format("MMM YY"),
    compliancePercentage: Number(
      (snapshot.overall_compliance_rate * 100).toFixed(1),
    ),
    membersTracked: snapshot.total_users,
    missingCount,
    expiredCount,
    expiringSoonCount,
    atRiskCount: missingCount + expiredCount + expiringSoonCount,
    snapshotDate: snapshot.snapshot_date,
    source: "snapshot",
  };
}

function buildTrendPointFromCurrentData(
  currentData: TrainingStatusData,
  now: Date,
): TrainingStatusTrendPoint {
  const liveCounts = buildLiveTrendStatusCounts(currentData.exportRows);
  const monthDate = dayjs(now);

  return {
    month: monthDate.format("YYYY-MM"),
    label: monthDate.format("MMM YY"),
    compliancePercentage: currentData.complianceStats.compliancePercentage,
    membersTracked: currentData.trainingData.length,
    missingCount: liveCounts.missing,
    expiredCount: liveCounts.expired,
    expiringSoonCount: liveCounts.expiringSoon,
    atRiskCount:
      liveCounts.missing + liveCounts.expired + liveCounts.expiringSoon,
    snapshotDate: monthDate.format("YYYY-MM-DD"),
    source: "live",
  };
}

function buildMonthlyTrend(
  snapshots: CertificationSnapshot[],
  currentData: TrainingStatusData,
  now: Date,
): TrainingStatusTrendPoint[] {
  const monthlyPoints = new Map<string, TrainingStatusTrendPoint>();

  [...snapshots]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .forEach((snapshot) => {
      const point = buildTrendPointFromSnapshot(snapshot);
      const existing = monthlyPoints.get(point.month);
      if (!existing || existing.snapshotDate < point.snapshotDate) {
        monthlyPoints.set(point.month, point);
      }
    });

  const currentPoint = buildTrendPointFromCurrentData(currentData, now);
  monthlyPoints.set(currentPoint.month, currentPoint);

  return Array.from(monthlyPoints.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

function buildDashboardCallouts(
  summary: TrainingStatusDashboardSummary,
  monthlyTrend: TrainingStatusTrendPoint[],
  riskLeaderboard: TrainingStatusRiskLeaderboardItem[],
): TrainingStatusDashboardCallout[] {
  const previousPoint =
    monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
  const trendValue = summary.complianceDeltaPercentagePoints;
  const trendTone =
    trendValue == null
      ? "info"
      : trendValue > 0
        ? "success"
        : trendValue < 0
          ? "error"
          : "warning";
  const trendDescription = previousPoint
    ? `Compared with ${previousPoint.label}`
    : "Trend data will become more useful as monthly snapshots accumulate.";

  const topRisk = riskLeaderboard[0];
  const soonestExpiring = [...riskLeaderboard]
    .filter((item) => item.averageDaysToExpiration != null)
    .sort(
      (a, b) =>
        (a.averageDaysToExpiration ?? Number.POSITIVE_INFINITY) -
        (b.averageDaysToExpiration ?? Number.POSITIVE_INFINITY),
    )[0];

  return [
    {
      title: "Monthly trend",
      value:
        trendValue == null
          ? "Awaiting history"
          : `${trendValue > 0 ? "+" : ""}${trendValue.toFixed(1)} pts`,
      description: trendDescription,
      tone: trendTone,
    },
    {
      title: "Highest current risk",
      value: topRisk ? topRisk.certificationType : "No current training risk",
      description: topRisk
        ? `${topRisk.totalRiskCount} required-cert issues across missing, expired, and expiring soon statuses`
        : "All required certifications are currently active.",
      tone: topRisk && topRisk.totalRiskCount > 0 ? "warning" : "success",
    },
    {
      title: "Most urgent renewal window",
      value:
        soonestExpiring && soonestExpiring.averageDaysToExpiration != null
          ? `${soonestExpiring.certificationType} · ${soonestExpiring.averageDaysToExpiration} days`
          : "No renewal pressure",
      description:
        soonestExpiring && soonestExpiring.averageDaysToExpiration != null
          ? "Average days remaining for active or expiring-soon required certifications"
          : "No valid renewal dates are available in the current dataset.",
      tone:
        soonestExpiring &&
        soonestExpiring.averageDaysToExpiration != null &&
        soonestExpiring.averageDaysToExpiration <= 30
          ? "error"
          : "info",
    },
  ];
}

export function buildTrainingStatusDashboardData({
  currentData,
  snapshots,
  now = new Date(),
}: BuildTrainingStatusDashboardDataParams): TrainingStatusDashboardData {
  const monthlyTrend = buildMonthlyTrend(snapshots, currentData, now);
  const latestSnapshotDate =
    [...snapshots].sort((a, b) =>
      b.snapshot_date.localeCompare(a.snapshot_date),
    )[0]?.snapshot_date ?? null;
  const requiredStatusCounts = buildRequiredStatusCounts(
    currentData.exportRows,
  );
  const complianceDeltaPercentagePoints =
    monthlyTrend.length > 1
      ? Number(
          (
            monthlyTrend[monthlyTrend.length - 1].compliancePercentage -
            monthlyTrend[monthlyTrend.length - 2].compliancePercentage
          ).toFixed(1),
        )
      : null;
  const riskLeaderboard = buildRiskLeaderboard(currentData.exportRows).slice(
    0,
    5,
  );
  const atRiskMembers = new Set(
    currentData.exportRows
      .filter((row) => row.required && row.status !== "active")
      .map((row) => row.user_id),
  ).size;
  const dashboardSummary: TrainingStatusDashboardSummary = {
    membersTracked: currentData.trainingData.length,
    atRiskMembers,
    requiredCertsAtRisk:
      requiredStatusCounts.expiringSoon +
      requiredStatusCounts.expired +
      requiredStatusCounts.missing,
    overallCompliancePercentage:
      currentData.complianceStats.compliancePercentage,
    complianceDeltaPercentagePoints,
    latestSnapshotDate,
    trendMonths: monthlyTrend.length,
    requiredStatusCounts,
  };

  return {
    ...currentData,
    dashboardSummary,
    monthlyTrend,
    riskLeaderboard,
    dashboardCallouts: buildDashboardCallouts(
      dashboardSummary,
      monthlyTrend,
      riskLeaderboard,
    ),
  };
}
