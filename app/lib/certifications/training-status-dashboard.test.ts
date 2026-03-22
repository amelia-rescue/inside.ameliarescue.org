import { describe, expect, it } from "vitest";

import { buildTrainingStatusData } from "./training-status-export";
import { buildTrainingStatusDashboardData } from "./training-status-dashboard";

describe("buildTrainingStatusDashboardData", () => {
  it("builds monthly trend data, risk summary, and callouts from snapshots plus current data", () => {
    const now = new Date("2026-03-21T18:00:00.000Z");
    const currentData = buildTrainingStatusData({
      now,
      users: [
        {
          user_id: "u1",
          first_name: "Alex",
          last_name: "Rivera",
          email: "alex@ameliarescue.org",
          website_role: "user",
          membership_roles: [
            {
              role_name: "EMT",
              track_name: "Operations",
              precepting: false,
            },
          ],
        },
        {
          user_id: "u2",
          first_name: "Sam",
          last_name: "Taylor",
          email: "sam@ameliarescue.org",
          website_role: "user",
          membership_roles: [
            {
              role_name: "EMT",
              track_name: "Operations",
              precepting: false,
            },
          ],
        },
      ],
      tracks: [
        {
          name: "Operations",
          description: "Operations track",
          required_certifications: ["CPR", "EVOC"],
        },
      ],
      certificationsByUserId: {
        u1: [
          {
            certification_id: "c1",
            user_id: "u1",
            certification_type_name: "CPR",
            file_url: "https://inside.ameliarescue.org/files/cpr-u1.pdf",
            issued_on: "2025-01-01",
            expires_on: "2026-05-01",
            uploaded_at: "2025-01-02T00:00:00.000Z",
          },
        ],
        u2: [
          {
            certification_id: "c2",
            user_id: "u2",
            certification_type_name: "CPR",
            file_url: "https://inside.ameliarescue.org/files/cpr-u2.pdf",
            issued_on: "2024-01-01",
            expires_on: "2024-12-31",
            uploaded_at: "2024-01-02T00:00:00.000Z",
          },
        ],
      },
    });

    const dashboardData = buildTrainingStatusDashboardData({
      currentData,
      now,
      snapshots: [
        {
          snapshot_date: "2026-01-31",
          created_at: "2026-01-31T12:00:00.000Z",
          total_users: 2,
          overall_compliance_rate: 0.4,
          compliance_by_role: [],
          compliance_by_track: [],
          cert_type_stats: [
            {
              cert_name: "CPR",
              total_count: 2,
              expired_count: 0,
              expiring_soon_count: 1,
              missing_count: 0,
              avg_days_to_expiration: 120,
            },
            {
              cert_name: "EVOC",
              total_count: 0,
              expired_count: 0,
              expiring_soon_count: 0,
              missing_count: 2,
              avg_days_to_expiration: null,
            },
          ],
          reminder_stats: {
            expired_sent: 0,
            expiring_sent: 0,
            missing_sent: 0,
          },
        },
        {
          snapshot_date: "2026-02-28",
          created_at: "2026-02-28T12:00:00.000Z",
          total_users: 2,
          overall_compliance_rate: 0.5,
          compliance_by_role: [],
          compliance_by_track: [],
          cert_type_stats: [
            {
              cert_name: "CPR",
              total_count: 2,
              expired_count: 1,
              expiring_soon_count: 0,
              missing_count: 0,
              avg_days_to_expiration: 95,
            },
            {
              cert_name: "EVOC",
              total_count: 0,
              expired_count: 0,
              expiring_soon_count: 0,
              missing_count: 2,
              avg_days_to_expiration: null,
            },
          ],
          reminder_stats: {
            expired_sent: 0,
            expiring_sent: 0,
            missing_sent: 0,
          },
        },
      ],
    });

    expect(dashboardData.dashboardSummary.membersTracked).toBe(2);
    expect(dashboardData.dashboardSummary.atRiskMembers).toBe(2);
    expect(dashboardData.dashboardSummary.requiredCertsAtRisk).toBe(4);
    expect(dashboardData.dashboardSummary.overallCompliancePercentage).toBe(25);
    expect(dashboardData.dashboardSummary.complianceDeltaPercentagePoints).toBe(
      -25,
    );
    expect(dashboardData.dashboardSummary.latestSnapshotDate).toBe(
      "2026-02-28",
    );
    expect(dashboardData.dashboardSummary.requiredStatusCounts).toEqual({
      active: 0,
      expiringSoon: 1,
      expired: 1,
      missing: 2,
    });

    expect(dashboardData.monthlyTrend.map((point) => point.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(dashboardData.monthlyTrend[2]).toMatchObject({
      source: "live",
      compliancePercentage: 25,
      missingCount: 2,
      expiredCount: 1,
      expiringSoonCount: 1,
    });

    expect(dashboardData.riskLeaderboard[0]).toMatchObject({
      certificationType: "EVOC",
      totalRiskCount: 2,
      missingCount: 2,
      expiredCount: 0,
      expiringSoonCount: 0,
    });

    expect(dashboardData.dashboardCallouts).toHaveLength(3);
    expect(dashboardData.dashboardCallouts[0]).toMatchObject({
      title: "Monthly trend",
      value: "-25.0 pts",
      tone: "error",
    });
  });

  it("uses the latest snapshot in a month and falls back cleanly when no history exists", () => {
    const now = new Date("2026-03-21T18:00:00.000Z");
    const currentData = buildTrainingStatusData({
      now,
      users: [
        {
          user_id: "u1",
          first_name: "Jamie",
          last_name: "Lee",
          email: "jamie@ameliarescue.org",
          website_role: "user",
          membership_roles: [
            {
              role_name: "Driver",
              track_name: "Transport",
              precepting: false,
            },
          ],
        },
      ],
      tracks: [
        {
          name: "Transport",
          description: "Transport track",
          required_certifications: ["EVOC"],
        },
      ],
      certificationsByUserId: {
        u1: [
          {
            certification_id: "c3",
            user_id: "u1",
            certification_type_name: "EVOC",
            file_url: "https://inside.ameliarescue.org/files/evoc.pdf",
            issued_on: "2025-01-01",
            expires_on: "2027-01-01",
            uploaded_at: "2025-01-02T00:00:00.000Z",
          },
        ],
      },
    });

    const dashboardData = buildTrainingStatusDashboardData({
      currentData,
      now,
      snapshots: [
        {
          snapshot_date: "2026-03-01",
          created_at: "2026-03-01T08:00:00.000Z",
          total_users: 1,
          overall_compliance_rate: 0.2,
          compliance_by_role: [],
          compliance_by_track: [],
          cert_type_stats: [],
          reminder_stats: {
            expired_sent: 0,
            expiring_sent: 0,
            missing_sent: 0,
          },
        },
        {
          snapshot_date: "2026-03-10",
          created_at: "2026-03-10T08:00:00.000Z",
          total_users: 1,
          overall_compliance_rate: 0.7,
          compliance_by_role: [],
          compliance_by_track: [],
          cert_type_stats: [],
          reminder_stats: {
            expired_sent: 0,
            expiring_sent: 0,
            missing_sent: 0,
          },
        },
      ],
    });

    expect(dashboardData.monthlyTrend).toHaveLength(1);
    expect(dashboardData.monthlyTrend[0]).toMatchObject({
      month: "2026-03",
      source: "live",
      compliancePercentage: 100,
    });
    expect(
      dashboardData.dashboardSummary.complianceDeltaPercentagePoints,
    ).toBeNull();
    expect(dashboardData.dashboardCallouts[0]).toMatchObject({
      value: "Awaiting history",
      tone: "info",
    });
  });
});
