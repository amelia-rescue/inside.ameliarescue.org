import dayjs from "dayjs";
import { CertificationStore } from "./certification-store";
import {
  CertificationTypeStore,
  type CertificationType,
} from "./certification-type-store";
import { RoleStore, type Role } from "./role-store";
import { TrackStore, type Track } from "./track-store";
import { UserStore, type User } from "./user-store";

class CertificationReminder {
  private readonly userStore: UserStore;
  private readonly roleStore: RoleStore;
  private readonly certificationStore: CertificationStore;
  private readonly trackStore: TrackStore;
  private readonly certificationTypeStore: CertificationTypeStore;

  private certificationTypes: CertificationType[] = [];
  private roles: Role[] = [];
  private tracks: Track[] = [];

  constructor() {
    this.userStore = UserStore.make();
    this.roleStore = RoleStore.make();
    this.certificationStore = CertificationStore.make();
    this.trackStore = TrackStore.make();
    this.certificationTypeStore = CertificationTypeStore.make();
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
      // todo: save the notifications sent in dynamo somewhere
      // if reminder sent then skip
      const reminderSent = false;
      if (!reminderSent) {
        // send the reminder
        // save the fact that the reminder was sent
      }
    }
  }
}
