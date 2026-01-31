import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import { CertificationSnapshotGenerator } from "./certification-snapshot";
import { UserStore } from "./user-store";
import { RoleStore } from "./role-store";
import { TrackStore } from "./track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { CertificationStore } from "./certification-store";
import { CertificationReminderStore } from "./certification-reminder-store";
import { CertificationSnapshotStore } from "./certification-snapshot-store";
import dayjs from "dayjs";

describe("certification snapshot test", () => {
  let dynamo: DynaliteServer;
  let mockCognitoClient: any;
  let userStore: UserStore;
  let roleStore: RoleStore;
  let trackStore: TrackStore;
  let certificationTypeStore: CertificationTypeStore;
  let certificationStore: CertificationStore;
  let certificationReminderStore: CertificationReminderStore;
  let certificationSnapshotStore: CertificationSnapshotStore;
  let snapshotStore: CertificationSnapshotStore;

  beforeEach(async () => {
    const cognitoSendSpy = vi.fn().mockImplementation(async () => {
      return {
        User: {
          Username: crypto.randomUUID(),
        },
      };
    });

    mockCognitoClient = {
      send: cognitoSendSpy,
    };

    userStore = UserStore.make({ cognito: mockCognitoClient });
    roleStore = RoleStore.make();
    trackStore = TrackStore.make();
    certificationTypeStore = CertificationTypeStore.make();
    certificationStore = CertificationStore.make();
    certificationReminderStore = CertificationReminderStore.make();
    certificationSnapshotStore = CertificationSnapshotStore.make();
    snapshotStore = CertificationSnapshotStore.make();

    dynamo = await setupDynamo();

    // Create common test data used across multiple tests
    await roleStore.createRole({
      name: "Crew Member",
      description: "Basic crew member role",
      allowed_tracks: ["BLS"],
    });

    await trackStore.createTrack({
      name: "BLS",
      description: "Basic Life Support track",
      required_certifications: ["CPR"],
    });

    await certificationTypeStore.createCertificationType({
      name: "CPR",
      description: "CPR certification",
      expires: true,
    });
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should generate a daily snapshot with correct structure", async () => {
    const user = await userStore.createUser({
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create valid certification
    await certificationStore.createCertification({
      certification_id: "cert-1",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.snapshot_date).toBe(dayjs().format("YYYY-MM-DD"));
    expect(snapshot.total_users).toBe(1);
    expect(snapshot.overall_compliance_rate).toBe(1);
    expect(snapshot.compliance_by_role).toHaveLength(1);
    expect(snapshot.compliance_by_track).toHaveLength(1);
    expect(snapshot.cert_type_stats).toHaveLength(1);

    // Verify it was saved
    const retrieved = await snapshotStore.getSnapshot(snapshot.snapshot_date);
    expect(retrieved).toMatchObject(snapshot);
  });

  it("should calculate compliance correctly for compliant user", async () => {
    await roleStore.createRole({
      name: "Provider",
      description: "Provider role",
      allowed_tracks: ["ALS"],
    });

    await trackStore.createTrack({
      name: "ALS",
      description: "Advanced Life Support",
      required_certifications: ["ACLS", "PALS"],
    });

    await certificationTypeStore.createCertificationType({
      name: "ACLS",
      description: "Advanced Cardiac Life Support",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: "PALS",
      description: "Pediatric Advanced Life Support",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Provider", track_name: "ALS", precepting: false },
      ],
    });

    // User has both required certs
    await certificationStore.createCertification({
      certification_id: "cert-acls",
      user_id: user.user_id,
      certification_type_name: "ACLS",
      file_url: "https://example.com/acls.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    await certificationStore.createCertification({
      certification_id: "cert-pals",
      user_id: user.user_id,
      certification_type_name: "PALS",
      file_url: "https://example.com/pals.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.total_users).toBe(1);
    expect(snapshot.overall_compliance_rate).toBe(1);

    const providerCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === "Provider",
    );
    expect(providerCompliance?.compliance_rate).toBe(1);
    expect(providerCompliance?.compliant_count).toBe(1);
  });

  it("should calculate compliance correctly for non-compliant user with expired cert", async () => {
    const user = await userStore.createUser({
      first_name: "Bob",
      last_name: "Johnson",
      email: "bob@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // User has expired cert
    await certificationStore.createCertification({
      certification_id: "cert-expired",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cpr.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: dayjs().subtract(1, "day").toISOString(),
    });

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.total_users).toBe(1);
    expect(snapshot.overall_compliance_rate).toBe(0);

    const crewCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === "Crew Member",
    );
    expect(crewCompliance?.compliance_rate).toBe(0);
    expect(crewCompliance?.compliant_count).toBe(0);
  });

  it("should calculate compliance correctly for non-compliant user with missing cert", async () => {
    await roleStore.createRole({
      name: "Paramedic",
      description: "Paramedic role",
      allowed_tracks: ["ALS"],
    });

    await trackStore.createTrack({
      name: "ALS",
      description: "Advanced Life Support",
      required_certifications: ["ACLS"],
    });

    await certificationTypeStore.createCertificationType({
      name: "ACLS",
      description: "Advanced Cardiac Life Support",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Alice",
      last_name: "Williams",
      email: "alice@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Paramedic", track_name: "ALS", precepting: false },
      ],
    });

    // User has no certifications

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.total_users).toBe(1);
    expect(snapshot.overall_compliance_rate).toBe(0);

    const paramedicCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === "Paramedic",
    );
    expect(paramedicCompliance?.compliance_rate).toBe(0);
  });

  it("should calculate cert type stats correctly", async () => {
    // Create 3 users
    const user1 = await userStore.createUser({
      first_name: "User",
      last_name: "One",
      email: "user1@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const user2 = await userStore.createUser({
      first_name: "User",
      last_name: "Two",
      email: "user2@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const user3 = await userStore.createUser({
      first_name: "User",
      last_name: "Three",
      email: "user3@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // User 1: Valid cert
    await certificationStore.createCertification({
      certification_id: "cert-1",
      user_id: user1.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert1.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(6, "months").toISOString(),
    });

    // User 2: Expired cert
    await certificationStore.createCertification({
      certification_id: "cert-2",
      user_id: user2.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert2.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: dayjs().subtract(1, "month").toISOString(),
    });

    // User 3: No cert (missing)

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    const cprStats = snapshot.cert_type_stats.find(
      (s) => s.cert_name === "CPR",
    );

    expect(cprStats).toBeDefined();
    expect(cprStats?.total_count).toBe(2); // 2 certs exist
    expect(cprStats?.expired_count).toBe(1); // 1 expired
    expect(cprStats?.expiring_soon_count).toBe(0); // None expiring soon
    expect(cprStats?.missing_count).toBe(1); // User 3 missing
    expect(cprStats?.avg_days_to_expiration).toBeGreaterThan(0); // User 1's cert
  });

  it("should retrieve snapshot by date and type", async () => {
    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    const retrieved = await snapshotStore.getSnapshot(snapshot.snapshot_date);

    expect(retrieved).toMatchObject(snapshot);
  });

  it("should retrieve latest snapshot by type", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const snapshotStore = CertificationSnapshotStore.make();

    const generator = new CertificationSnapshotGenerator({ userStore });

    // Create multiple snapshots
    await generator.generateAndSaveSnapshot();

    const latest = await snapshotStore.getLatestSnapshot();

    expect(latest).toBeDefined();
    expect(latest?.snapshot_date).toBe(dayjs().format("YYYY-MM-DD"));
  });

  it("should handle multiple users with mixed compliance", async () => {
    // Create 4 users: 2 compliant, 2 non-compliant
    const compliantUser1 = await userStore.createUser({
      first_name: "Compliant",
      last_name: "One",
      email: "compliant1@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const compliantUser2 = await userStore.createUser({
      first_name: "Compliant",
      last_name: "Two",
      email: "compliant2@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const nonCompliantUser1 = await userStore.createUser({
      first_name: "NonCompliant",
      last_name: "One",
      email: "noncompliant1@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const nonCompliantUser2 = await userStore.createUser({
      first_name: "NonCompliant",
      last_name: "Two",
      email: "noncompliant2@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Add valid certs for compliant users
    await certificationStore.createCertification({
      certification_id: "cert-c1",
      user_id: compliantUser1.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    await certificationStore.createCertification({
      certification_id: "cert-c2",
      user_id: compliantUser2.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    // Non-compliant users have no certs

    const generator = new CertificationSnapshotGenerator({ userStore });
    const snapshot = await generator.generateAndSaveSnapshot();

    expect(snapshot.total_users).toBe(4);
    expect(snapshot.overall_compliance_rate).toBe(0.5); // 2 out of 4

    const crewCompliance = snapshot.compliance_by_role.find(
      (r) => r.role_name === "Crew Member",
    );
    expect(crewCompliance?.user_count).toBe(4);
    expect(crewCompliance?.compliant_count).toBe(2);
    expect(crewCompliance?.compliance_rate).toBe(0.5);
  });
});
