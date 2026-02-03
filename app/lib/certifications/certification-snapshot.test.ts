import { describe, it, expect, vi } from "vitest";
import { CertificationSnapshotGenerator } from "./certification-snapshot";
import { UserStore } from "../user-store";
import { RoleStore } from "../role-store";
import { TrackStore } from "../track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { CertificationStore } from "./certification-store";
import { CertificationSnapshotStore } from "./certification-snapshot-store";
import dayjs from "dayjs";

describe("certification snapshot test", () => {
  it("should generate a daily snapshot with correct structure", async () => {
    const testId = crypto.randomUUID();
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const snapshotStore = CertificationSnapshotStore.make();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "John",
      last_name: "Doe",
      email: `john-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: `cert-${testId}`,
      user_id: user.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.snapshot_date).toBe(dayjs().format("YYYY-MM-DD"));
    expect(snapshot.total_users).toBeGreaterThanOrEqual(1);
    expect(snapshot.compliance_by_role.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.compliance_by_track.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.cert_type_stats.length).toBeGreaterThanOrEqual(1);

    const retrieved = await snapshotStore.getSnapshot(snapshot.snapshot_date);
    expect(retrieved?.snapshot_date).toBe(snapshot.snapshot_date);
  });

  it("should calculate compliance correctly for compliant user", async () => {
    const testId = crypto.randomUUID();
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

    await roleStore.createRole({
      name: `Provider-${testId}`,
      description: "Provider role",
      allowed_tracks: [`ALS-${testId}`],
    });

    await trackStore.createTrack({
      name: `ALS-${testId}`,
      description: "Advanced Life Support",
      required_certifications: [`ACLS-${testId}`, `PALS-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `ACLS-${testId}`,
      description: "Advanced Cardiac Life Support",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: `PALS-${testId}`,
      description: "Pediatric Advanced Life Support",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Jane",
      last_name: "Smith",
      email: `jane-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Provider-${testId}`, track_name: `ALS-${testId}`, precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: `cert-acls-${testId}`,
      user_id: user.user_id,
      certification_type_name: `ACLS-${testId}`,
      file_url: "https://example.com/acls.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    await certificationStore.createCertification({
      certification_id: `cert-pals-${testId}`,
      user_id: user.user_id,
      certification_type_name: `PALS-${testId}`,
      file_url: "https://example.com/pals.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    const providerCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === `Provider-${testId}`,
    );
    expect(providerCompliance?.compliance_rate).toBe(1);
    expect(providerCompliance?.compliant_count).toBe(1);
  });

  it("should calculate compliance correctly for non-compliant user with expired cert", async () => {
    const testId = crypto.randomUUID();
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Bob",
      last_name: "Johnson",
      email: `bob-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: `cert-expired-${testId}`,
      user_id: user.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cpr.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: dayjs().subtract(1, "day").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    const crewCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === `Crew Member-${testId}`,
    );
    expect(crewCompliance?.compliance_rate).toBe(0);
    expect(crewCompliance?.compliant_count).toBe(0);
  });

  it("should calculate cert type stats correctly", async () => {
    const testId = crypto.randomUUID();
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    const user1 = await userStore.createUser({
      first_name: "User",
      last_name: "One",
      email: `user1-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    const user2 = await userStore.createUser({
      first_name: "User",
      last_name: "Two",
      email: `user2-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    const user3 = await userStore.createUser({
      first_name: "User",
      last_name: "Three",
      email: `user3-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: `cert-1-${testId}`,
      user_id: user1.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert1.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(6, "months").toISOString(),
    });

    await certificationStore.createCertification({
      certification_id: `cert-2-${testId}`,
      user_id: user2.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert2.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: dayjs().subtract(1, "month").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    const cprStats = snapshot.cert_type_stats.find(
      (s) => s.cert_name === `CPR-${testId}`,
    );

    expect(cprStats).toBeDefined();
    expect(cprStats?.total_count).toBe(2);
    expect(cprStats?.expired_count).toBe(1);
    expect(cprStats?.missing_count).toBe(1);
  });

  it("should retrieve latest snapshot by type", async () => {
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const snapshotStore = CertificationSnapshotStore.make();

    const generator = new CertificationSnapshotGenerator({ userStore });
    await generator.generateAndSaveSnapshot();

    const latest = await snapshotStore.getLatestSnapshot();

    expect(latest).toBeDefined();
    expect(latest?.snapshot_date).toBe(dayjs().format("YYYY-MM-DD"));
  });
});
