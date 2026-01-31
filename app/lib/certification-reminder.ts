import dayjs from "dayjs";
import { CertificationStore } from "./certification-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "./certification-type-store";
import { RoleStore, type Role } from "./role-store";
import { TrackStore, type Track } from "./track-store";
import { UserStore, type User } from "./user-store";
import { CertificationReminderStore } from "./certification-reminder-store";
import { EmailService } from "./email-service";
import { log } from "./logger";

interface CertificationReminderDeps {
  userStore?: UserStore;
  roleStore?: RoleStore;
  certificationStore?: CertificationStore;
  trackStore?: TrackStore;
  certificationTypeStore?: CertificationTypeStore;
  certificationReminderStore?: CertificationReminderStore;
  emailService?: EmailService;
}

export class CertificationReminder {
  private readonly userStore: UserStore;
  private readonly roleStore: RoleStore;
  private readonly certificationStore: CertificationStore;
  private readonly trackStore: TrackStore;
  private readonly certificationTypeStore: CertificationTypeStore;
  private readonly certificationReminderStore: CertificationReminderStore;
  private readonly emailService: EmailService;

  private certificationTypes: CertificationType[] = [];
  private roles: Role[] = [];
  private tracks: Track[] = [];

  constructor(deps?: CertificationReminderDeps) {
    this.userStore = deps?.userStore ?? UserStore.make();
    this.roleStore = deps?.roleStore ?? RoleStore.make();
    this.certificationStore =
      deps?.certificationStore ?? CertificationStore.make();
    this.trackStore = deps?.trackStore ?? TrackStore.make();
    this.certificationTypeStore =
      deps?.certificationTypeStore ?? CertificationTypeStore.make();
    this.certificationReminderStore =
      deps?.certificationReminderStore ?? CertificationReminderStore.make();
    this.emailService = deps?.emailService ?? EmailService.make();
  }

  /**
   * looks at all active users, checks for their required certifications,
   * and then sends communications to them asking them to upload new ones
   */
  public async checkAllUserCertifications() {
    // load some data to save into state
    this.certificationTypes =
      await this.certificationTypeStore.listCertificationTypes();
    this.roles = await this.roleStore.listRoles();
    this.tracks = await this.trackStore.listTracks();

    // list all the active users
    const users = await this.userStore.listUsers();
    for (const user of users) {
      await this.checkUserCertifications(user);
    }
  }

  private async checkUserCertifications(user: User) {
    // get all the roles the user has
    const userRoles = this.roles.filter((role) =>
      user.membership_roles.some(
        (userRole) => userRole.role_name === role.name,
      ),
    );
    // get all the tracks for from the user roles
    const userTracks = new Set<Track>();
    for (const userRole of userRoles) {
      userRole.allowed_tracks.forEach((trackName) => {
        userTracks.add(this.tracks.find((track) => track.name === trackName)!);
      });
    }

    // use the tracks to get all the required certifications for this user
    const requiredCertification = new Set<CertificationType>();
    userTracks.forEach((track) => {
      track.required_certifications.forEach((requiredCert) => {
        const requriedCert = this.certificationTypes.find(
          (cert) => cert.name === requiredCert,
        );
        if (requriedCert) {
          requiredCertification.add(requriedCert);
        }
      });
    });

    // get all of the certifications that they have uploaded
    const certifications =
      await this.certificationStore.listCertificationsByUser(user.user_id);

    // compare the certifications to the required certifications
    const missingCertifications = Array.from(requiredCertification).filter(
      (cert) => {
        return !certifications.some(
          (c) => c.certification_type_name === cert.name,
        );
      },
    );

    const certificationsExpiringIn3Months = certifications.filter((cert) => {
      if (cert.expires_on) {
        return (
          dayjs(cert.expires_on).isBefore(dayjs().add(3, "months")) &&
          dayjs(cert.expires_on).isAfter(dayjs())
        );
      }
      return false;
    });

    const expiredCerts = certifications.filter((cert) =>
      dayjs(cert.expires_on).isBefore(dayjs()),
    );

    for (const cert of expiredCerts) {
      const hasReminder =
        await this.certificationReminderStore.hasReminderOfType(
          user.user_id,
          cert.certification_id,
          "expired",
        );

      if (!hasReminder) {
        log.info("Sending expired certification reminder", {
          user_id: user.user_id,
          certification_id: cert.certification_id,
        });

        try {
          await this.emailService.sendCertificationExpiredEmail({
            user,
            certificationName: cert.certification_type_name,
            expirationDate: dayjs(cert.expires_on).format("MMMM D, YYYY"),
          });

          await this.certificationReminderStore.createReminder({
            reminder_id: `${user.user_id}-${cert.certification_id}-expired-${Date.now()}`,
            user_id: user.user_id,
            certification_id: cert.certification_id,
            reminder_type: "expired",
            sent_at: new Date().toISOString(),
            email_sent: true,
          });
        } catch (error) {
          log.error("Failed to send expired certification email", {
            user_id: user.user_id,
            error,
          });
        }
      }
    }

    for (const cert of certificationsExpiringIn3Months) {
      const hasReminder =
        await this.certificationReminderStore.hasReminderOfType(
          user.user_id,
          cert.certification_id,
          "expiring_soon",
        );

      if (!hasReminder) {
        log.info("Sending expiring soon certification reminder", {
          user_id: user.user_id,
          certification_id: cert.certification_id,
        });

        try {
          await this.emailService.sendCertificationExpiringSoonEmail({
            user,
            certificationName: cert.certification_type_name,
            expirationDate: dayjs(cert.expires_on).format("MMMM D, YYYY"),
          });

          await this.certificationReminderStore.createReminder({
            reminder_id: `${user.user_id}-${cert.certification_id}-expiring-${Date.now()}`,
            user_id: user.user_id,
            certification_id: cert.certification_id,
            reminder_type: "expiring_soon",
            sent_at: new Date().toISOString(),
            email_sent: true,
          });
        } catch (error) {
          log.error("Failed to send expiring soon certification email", {
            user_id: user.user_id,
            error,
          });
        }
      }
    }

    for (const missingCert of missingCertifications) {
      const hasReminder =
        await this.certificationReminderStore.hasReminderOfType(
          user.user_id,
          `missing-${missingCert.name}`,
          "missing",
        );

      if (!hasReminder) {
        log.info("Sending missing certification reminder", {
          user_id: user.user_id,
          certification_type: missingCert.name,
        });

        try {
          await this.emailService.sendMissingCertificationEmail({
            user,
            certificationName: missingCert.name,
          });

          await this.certificationReminderStore.createReminder({
            reminder_id: `${user.user_id}-missing-${missingCert.name}-${Date.now()}`,
            user_id: user.user_id,
            certification_id: `missing-${missingCert.name}`,
            reminder_type: "missing",
            sent_at: new Date().toISOString(),
            email_sent: true,
          });
        } catch (error) {
          log.error("Failed to send missing certification email", {
            user_id: user.user_id,
            error,
          });
        }
      }
    }
  }
}
