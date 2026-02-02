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

    // Load all data
    const users = await this.userStore.listUsers();
    const roles = await this.roleStore.listRoles();
    const tracks = await this.trackStore.listTracks();
    const certificationTypes =
      await this.certificationTypeStore.listCertificationTypes();

    // Calculate compliance for each user
    const userCompliance = await Promise.all(
      users.map(async (user) => {
        const isCompliant = await this.isUserCompliant(
          user,
          roles,
          tracks,
          certificationTypes,
        );
        return { user, isCompliant };
      }),
    );

    const totalUsers = users.length;
    const compliantUsers = userCompliance.filter((uc) => uc.isCompliant).length;
    const overallComplianceRate =
      totalUsers > 0 ? compliantUsers / totalUsers : 0;

    // Calculate compliance by role
    const complianceByRole = await this.calculateComplianceByRole(
      userCompliance,
      roles,
    );

    // Calculate compliance by track
    const complianceByTrack = await this.calculateComplianceByTrack(
      userCompliance,
      tracks,
    );

    // Calculate cert type stats
    const certTypeStats = await this.calculateCertTypeStats(
      users,
      certificationTypes,
      roles,
      tracks,
    );

    // Calculate reminder stats
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

  private async isUserCompliant(
    user: User,
    roles: Role[],
    tracks: Track[],
    certificationTypes: CertificationType[],
  ): Promise<boolean> {
    // Get required certifications for this user
    const requiredCerts = this.getRequiredCertifications(
      user,
      roles,
      tracks,
      certificationTypes,
    );

    if (requiredCerts.size === 0) {
      return true; // No requirements = compliant
    }

    // Get user's certifications
    const userCerts = await this.certificationStore.listCertificationsByUser(
      user.user_id,
    );

    // Check if all required certs are present and not expired
    for (const requiredCert of requiredCerts) {
      const cert = userCerts.find(
        (c) => c.certification_type_name === requiredCert.name,
      );

      if (!cert) {
        return false; // Missing required cert
      }

      if (cert.expires_on && dayjs(cert.expires_on).isBefore(dayjs())) {
        return false; // Expired cert
      }
    }

    return true;
  }

  private getRequiredCertifications(
    user: User,
    roles: Role[],
    tracks: Track[],
    certificationTypes: CertificationType[],
  ): Set<CertificationType> {
    const userRoles = roles.filter((role) =>
      user.membership_roles.some(
        (userRole) => userRole.role_name === role.name,
      ),
    );

    const userTracks = new Set<Track>();
    for (const userRole of userRoles) {
      userRole.allowed_tracks.forEach((trackName) => {
        const track = tracks.find((t) => t.name === trackName);
        if (track) {
          userTracks.add(track);
        }
      });
    }

    const requiredCerts = new Set<CertificationType>();
    userTracks.forEach((track) => {
      track.required_certifications.forEach((certName) => {
        const cert = certificationTypes.find((ct) => ct.name === certName);
        if (cert) {
          requiredCerts.add(cert);
        }
      });
    });

    return requiredCerts;
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
    users: User[],
    certificationTypes: CertificationType[],
    roles: Role[],
    tracks: Track[],
  ) {
    return await Promise.all(
      certificationTypes.map(async (certType) => {
        // Get all certs of this type
        const allCerts = (
          await Promise.all(
            users.map((u) =>
              this.certificationStore.listCertificationsByUser(u.user_id),
            ),
          )
        )
          .flat()
          .filter((c) => c.certification_type_name === certType.name);

        const totalCount = allCerts.length;
        const expiredCount = allCerts.filter(
          (c) => c.expires_on && dayjs(c.expires_on).isBefore(dayjs()),
        ).length;

        const expiringSoonCount = allCerts.filter((c) => {
          if (!c.expires_on) return false;
          return (
            dayjs(c.expires_on).isBefore(dayjs().add(3, "months")) &&
            dayjs(c.expires_on).isAfter(dayjs())
          );
        }).length;

        // Calculate missing count (users who need this cert but don't have it)
        const usersNeedingCert = users.filter((user) => {
          const requiredCerts = this.getRequiredCertifications(
            user,
            roles,
            tracks,
            certificationTypes,
          );
          return Array.from(requiredCerts).some(
            (rc) => rc.name === certType.name,
          );
        });

        const usersWithCert = new Set(allCerts.map((c) => c.user_id));
        const missingCount = usersNeedingCert.filter(
          (u) => !usersWithCert.has(u.user_id),
        ).length;

        // Calculate average days to expiration for non-expired certs
        const activeCerts = allCerts.filter(
          (c) => c.expires_on && dayjs(c.expires_on).isAfter(dayjs()),
        );

        let avgDaysToExpiration: number | null = null;
        if (activeCerts.length > 0) {
          const totalDays = activeCerts.reduce((sum, cert) => {
            return sum + dayjs(cert.expires_on).diff(dayjs(), "days");
          }, 0);
          avgDaysToExpiration = Math.round(totalDays / activeCerts.length);
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
