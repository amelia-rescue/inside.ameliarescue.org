import dayjs from "dayjs";
import { UserStore, type User } from "../user-store";
import { RoleStore, type Role } from "../role-store";
import { TrackStore, type Track } from "../track-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "./certification-type-store";
import { CertificationStore } from "./certification-store";
import { CertificationReminderStore } from "./certification-reminder-store";
import {
  buildTrainingStatusData,
  type TrainingStatusRow,
} from "./training-status-export";
import {
  CertificationSnapshotStore,
  type CertificationSnapshot,
} from "./certification-snapshot-store";

interface CertificationSnapshotDeps {
  userStore?: UserStore;
  roleStore?: RoleStore;
  trackStore?: TrackStore;
  certificationTypeStore?: CertificationTypeStore;
  certificationStore?: CertificationStore;
  certificationReminderStore?: CertificationReminderStore;
  certificationSnapshotStore?: CertificationSnapshotStore;
}

export class CertificationSnapshotGenerator {
  private readonly userStore: UserStore;
  private readonly roleStore: RoleStore;
  private readonly trackStore: TrackStore;
  private readonly certificationTypeStore: CertificationTypeStore;
  private readonly certificationStore: CertificationStore;
  private readonly certificationReminderStore: CertificationReminderStore;
  private readonly certificationSnapshotStore: CertificationSnapshotStore;

  constructor(deps?: CertificationSnapshotDeps) {
    this.userStore = deps?.userStore ?? UserStore.make();
    this.roleStore = deps?.roleStore ?? RoleStore.make();
    this.trackStore = deps?.trackStore ?? TrackStore.make();
    this.certificationTypeStore =
      deps?.certificationTypeStore ?? CertificationTypeStore.make();
    this.certificationStore =
      deps?.certificationStore ?? CertificationStore.make();
    this.certificationReminderStore =
      deps?.certificationReminderStore ?? CertificationReminderStore.make();
    this.certificationSnapshotStore =
      deps?.certificationSnapshotStore ?? CertificationSnapshotStore.make();
  }

  public async generateAndSaveSnapshot(): Promise<CertificationSnapshot> {
    const snapshot = await this.generateSnapshot();
    return await this.certificationSnapshotStore.saveSnapshot(snapshot);
  }

  private async generateSnapshot(): Promise<CertificationSnapshot> {
    const snapshotDate = dayjs().format("YYYY-MM-DD");

    const users = await this.userStore.listUsers();
    const roles = await this.roleStore.listRoles();
    const tracks = await this.trackStore.listTracks();
    const certificationTypes =
      await this.certificationTypeStore.listCertificationTypes();
    const certificationsByUserEntries = await Promise.all(
      users.map(async (user) => {
        const certifications =
          await this.certificationStore.listCertificationsByUser(user.user_id);

        return [user.user_id, certifications] as const;
      }),
    );
    const certificationsByUserId = Object.fromEntries(
      certificationsByUserEntries,
    );
    const trainingStatusData = buildTrainingStatusData({
      users,
      tracks,
      certificationsByUserId,
    });
    const userCompliance = users.map((user) => {
      const trainingStatusRow = trainingStatusData.trainingData.find(
        (row) => row.user_id === user.user_id,
      );

      return {
        user,
        isCompliant: this.isTrainingStatusRowCompliant(trainingStatusRow),
      };
    });

    const totalUsers = users.length;
    const overallComplianceRate =
      trainingStatusData.complianceStats.totalRequiredCerts > 0
        ? trainingStatusData.complianceStats.totalValidCerts /
          trainingStatusData.complianceStats.totalRequiredCerts
        : 0;

    const complianceByRole = await this.calculateComplianceByRole(
      userCompliance,
      roles,
    );

    const complianceByTrack = await this.calculateComplianceByTrack(
      userCompliance,
      tracks,
    );

    const certTypeStats = await this.calculateCertTypeStats(
      certificationTypes,
      trainingStatusData.exportRows,
    );

    const reminderStats = await this.calculateReminderStats();

    return {
      snapshot_date: snapshotDate,
      created_at: new Date().toISOString(),
      total_users: totalUsers,
      overall_compliance_rate: overallComplianceRate,
      compliance_by_role: complianceByRole,
      compliance_by_track: complianceByTrack,
      cert_type_stats: certTypeStats,
      reminder_stats: reminderStats,
    };
  }

  private isTrainingStatusRowCompliant(
    trainingStatusRow: TrainingStatusRow | undefined,
  ): boolean {
    if (!trainingStatusRow) {
      return true;
    }

    return Object.values(trainingStatusRow.certifications).every(
      (status) => status === "active" || status === "expiring_soon",
    );
  }

  private async calculateComplianceByRole(
    userCompliance: { user: User; isCompliant: boolean }[],
    roles: Role[],
  ) {
    return roles.map((role) => {
      const usersWithRole = userCompliance.filter((uc) =>
        uc.user.membership_roles.some((mr) => mr.role_name === role.name),
      );
      const compliantCount = usersWithRole.filter(
        (uc) => uc.isCompliant,
      ).length;
      const userCount = usersWithRole.length;

      return {
        role_name: role.name,
        user_count: userCount,
        compliant_count: compliantCount,
        compliance_rate: userCount > 0 ? compliantCount / userCount : 0,
      };
    });
  }

  private async calculateComplianceByTrack(
    userCompliance: { user: User; isCompliant: boolean }[],
    tracks: Track[],
  ) {
    return tracks.map((track) => {
      const usersWithTrack = userCompliance.filter((uc) =>
        uc.user.membership_roles.some((mr) => mr.track_name === track.name),
      );
      const compliantCount = usersWithTrack.filter(
        (uc) => uc.isCompliant,
      ).length;
      const userCount = usersWithTrack.length;

      return {
        track_name: track.name,
        user_count: userCount,
        compliant_count: compliantCount,
        compliance_rate: userCount > 0 ? compliantCount / userCount : 0,
      };
    });
  }

  private async calculateCertTypeStats(
    certificationTypes: CertificationType[],
    exportRows: Array<{
      certification_type: string;
      required: boolean;
      status: string;
      expires_on: string;
      file_url: string;
    }>,
  ) {
    return await Promise.all(
      certificationTypes.map(async (certType) => {
        const certRows = exportRows.filter(
          (row) => row.certification_type === certType.name,
        );
        const currentCertRows = certRows.filter((row) => row.file_url);
        const totalCount = currentCertRows.length;
        const expiredCount = currentCertRows.filter(
          (row) => row.status === "expired",
        ).length;
        const expiringSoonCount = currentCertRows.filter(
          (row) => row.status === "expiring_soon",
        ).length;
        const missingCount = certRows.filter(
          (row) => row.required && row.status === "missing",
        ).length;
        const activeCerts = currentCertRows.filter(
          (row) => row.status === "active" || row.status === "expiring_soon",
        );
        const activeCertsWithValidExpiration = activeCerts.filter((row) => {
          if (!row.expires_on) {
            return false;
          }

          return dayjs(row.expires_on).isValid();
        });

        let avgDaysToExpiration: number | null = null;
        if (activeCertsWithValidExpiration.length > 0) {
          const totalDays = activeCertsWithValidExpiration.reduce(
            (sum, cert) => {
              return sum + dayjs(cert.expires_on).diff(dayjs(), "days");
            },
            0,
          );
          avgDaysToExpiration = Math.round(
            totalDays / activeCertsWithValidExpiration.length,
          );
        }

        return {
          cert_name: certType.name,
          total_count: totalCount,
          expired_count: expiredCount,
          expiring_soon_count: expiringSoonCount,
          missing_count: missingCount,
          avg_days_to_expiration: avgDaysToExpiration,
        };
      }),
    );
  }

  private async calculateReminderStats() {
    // Get reminders from the last 24 hours
    const yesterday = dayjs().subtract(1, "day").toISOString();
    const users = await this.userStore.listUsers();

    let expiredSent = 0;
    let expiringSent = 0;
    let missingSent = 0;

    for (const user of users) {
      const reminders =
        await this.certificationReminderStore.getRemindersByUser(user.user_id);

      const recentReminders = reminders.filter((r) =>
        dayjs(r.sent_at).isAfter(yesterday),
      );

      expiredSent += recentReminders.filter(
        (r) => r.reminder_type === "expired",
      ).length;
      expiringSent += recentReminders.filter(
        (r) => r.reminder_type === "expiring_soon",
      ).length;
      missingSent += recentReminders.filter(
        (r) => r.reminder_type === "missing",
      ).length;
    }

    return {
      expired_sent: expiredSent,
      expiring_sent: expiringSent,
      missing_sent: missingSent,
    };
  }
}
