import { RoleStore } from "./role-store";
import { TrackStore } from "./track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { CertificationStore } from "./certification-store";

export class InvalidRoleTrackCombination extends Error {
  constructor(role_id: string, track_id: string) {
    super(`Track ${track_id} is not allowed for role ${role_id}`);
  }
}

export class MissingRequiredCertification extends Error {
  constructor(
    user_id: string,
    track_id: string,
    certification_type_name: string,
  ) {
    super(
      `User ${user_id} is missing required certification ${certification_type_name} for track ${track_id}`,
    );
  }
}

export class MembershipService {
  private roleStore: RoleStore;
  private trackStore: TrackStore;
  private certificationTypeStore: CertificationTypeStore;
  private certificationStore: CertificationStore;

  constructor() {
    this.roleStore = RoleStore.make();
    this.trackStore = TrackStore.make();
    this.certificationTypeStore = CertificationTypeStore.make();
    this.certificationStore = CertificationStore.make();
  }

  public async validateRoleTrackCombination(
    role_id: string,
    track_id: string,
  ): Promise<boolean> {
    const role = await this.roleStore.getRole(role_id);
    return role.allowed_tracks.includes(track_id);
  }

  public async getTracksForRole(role_id: string): Promise<string[]> {
    const role = await this.roleStore.getRole(role_id);
    return role.allowed_tracks;
  }

  public async getRolesForTrack(track_id: string): Promise<string[]> {
    const allRoles = await this.roleStore.listRoles();
    return allRoles
      .filter((role) => role.allowed_tracks.includes(track_id))
      .map((role) => role.name);
  }

  public async getRequiredCertificationsForTrack(
    track_id: string,
  ): Promise<string[]> {
    const track = await this.trackStore.getTrack(track_id);
    return track.required_certifications;
  }

  public async getTracksForCertification(
    certification_type_name: string,
  ): Promise<string[]> {
    const allTracks = await this.trackStore.listTracks();
    return allTracks
      .filter((track) =>
        track.required_certifications.includes(certification_type_name),
      )
      .map((track) => track.name);
  }

  public async validateUserTrackEligibility(
    user_id: string,
    role_id: string,
    track_id: string,
  ): Promise<{ valid: boolean; missingCertifications: string[] }> {
    const isTrackAllowed = await this.validateRoleTrackCombination(
      role_id,
      track_id,
    );
    if (!isTrackAllowed) {
      throw new InvalidRoleTrackCombination(role_id, track_id);
    }

    const requiredCertifications =
      await this.getRequiredCertificationsForTrack(track_id);
    const userCertifications =
      await this.certificationStore.listCertificationsByUser(user_id);

    const userCertificationTypes = new Set(
      userCertifications.map((c) => c.certification_type_name),
    );

    const missingCertifications = requiredCertifications.filter(
      (certType) => !userCertificationTypes.has(certType),
    );

    return {
      valid: missingCertifications.length === 0,
      missingCertifications,
    };
  }

  public async getUserEligibleTracks(
    user_id: string,
    role_id: string,
  ): Promise<
    Array<{
      track_id: string;
      track_name: string;
      eligible: boolean;
      missingCertifications: string[];
    }>
  > {
    const allowedTrackIds = await this.getTracksForRole(role_id);
    const results = [];

    for (const track_id of allowedTrackIds) {
      const track = await this.trackStore.getTrack(track_id);
      const eligibility = await this.validateUserTrackEligibility(
        user_id,
        role_id,
        track_id,
      );

      results.push({
        track_id,
        track_name: track.name,
        eligible: eligibility.valid,
        missingCertifications: eligibility.missingCertifications,
      });
    }

    return results;
  }

  public async addTrackToRole(
    role_id: string,
    track_id: string,
  ): Promise<void> {
    const role = await this.roleStore.getRole(role_id);
    await this.trackStore.getTrack(track_id);

    if (!role.allowed_tracks.includes(track_id)) {
      await this.roleStore.updateRole({
        ...role,
        allowed_tracks: [...role.allowed_tracks, track_id],
      });
    }
  }

  public async removeTrackFromRole(
    role_id: string,
    track_id: string,
  ): Promise<void> {
    const role = await this.roleStore.getRole(role_id);
    await this.roleStore.updateRole({
      ...role,
      allowed_tracks: role.allowed_tracks.filter((t) => t !== track_id),
    });
  }

  public async addCertificationToTrack(
    track_id: string,
    certification_type_name: string,
  ): Promise<void> {
    const track = await this.trackStore.getTrack(track_id);
    await this.certificationTypeStore.getCertificationType(
      certification_type_name,
    );

    if (!track.required_certifications.includes(certification_type_name)) {
      await this.trackStore.updateTrack({
        ...track,
        required_certifications: [
          ...track.required_certifications,
          certification_type_name,
        ],
      });
    }
  }

  public async removeCertificationFromTrack(
    track_id: string,
    certification_type_name: string,
  ): Promise<void> {
    const track = await this.trackStore.getTrack(track_id);
    await this.trackStore.updateTrack({
      ...track,
      required_certifications: track.required_certifications.filter(
        (cert) => cert !== certification_type_name,
      ),
    });
  }
}
