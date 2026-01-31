import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import { CertificationReminder } from "./certification-reminder";
import { UserStore } from "./user-store";
import { RoleStore } from "./role-store";
import { TrackStore } from "./track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { CertificationStore } from "./certification-store";
import { CertificationReminderStore } from "./certification-reminder-store";
import { EmailService } from "./email-service";
import dayjs from "dayjs";

describe("certification reminder test", () => {
  let dynamo: DynaliteServer;
  let mockCognitoClient: any;
  let cognitoSendSpy: any;

  beforeEach(async () => {
    // Reset UserStore static cognito client
    (UserStore as any).cognito = undefined;

    cognitoSendSpy = vi.fn().mockImplementation(async () => {
      return {
        User: {
          Username: crypto.randomUUID(),
        },
      };
    });

    mockCognitoClient = {
      send: cognitoSendSpy,
    };

    dynamo = await setupDynamo(
      {
        tableName: "aes_users",
        partitionKey: "user_id",
      },
      {
        tableName: "aes_roles",
        partitionKey: "name",
      },
      {
        tableName: "aes_tracks",
        partitionKey: "name",
      },
      {
        tableName: "aes_certification_types",
        partitionKey: "name",
      },
      {
        tableName: "aes_user_certifications",
        partitionKey: "certification_id",
        gsi: [
          {
            indexName: "UserIdIndex",
            partitionKey: "user_id",
            sortKey: "uploaded_at",
          },
        ],
      },
      {
        tableName: "aes_certification_reminders",
        partitionKey: "reminder_id",
        gsi: [
          {
            indexName: "UserIdIndex",
            partitionKey: "user_id",
            sortKey: "sent_at",
          },
        ],
      },
    );

    // Mock EmailService to prevent actual email sending
    vi.spyOn(
      EmailService.prototype,
      "sendCertificationExpiredEmail",
    ).mockResolvedValue();
    vi.spyOn(
      EmailService.prototype,
      "sendCertificationExpiringSoonEmail",
    ).mockResolvedValue();
    vi.spyOn(
      EmailService.prototype,
      "sendMissingCertificationEmail",
    ).mockResolvedValue();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
    vi.restoreAllMocks();
  });

  it("should send expired certification reminder", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const reminderStore = CertificationReminderStore.make();

    // Create test data
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

    const user = await userStore.createUser({
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create expired certification
    const yesterday = dayjs().subtract(1, "day").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-1",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: yesterday,
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Verify email was sent
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: "john@example.com",
      }),
      certificationName: "CPR",
      expirationDate: expect.any(String),
    });

    // Verify reminder was stored
    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].reminder_type).toBe("expired");
    expect(reminders[0].certification_id).toBe("cert-1");
  });

  it("should send expiring soon certification reminder", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const reminderStore = CertificationReminderStore.make();

    // Create test data
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

    const user = await userStore.createUser({
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create certification expiring in 2 months
    const twoMonthsFromNow = dayjs().add(2, "months").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-2",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(1, "year").toISOString(),
      expires_on: twoMonthsFromNow,
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Verify email was sent
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: "jane@example.com",
      }),
      certificationName: "CPR",
      expirationDate: expect.any(String),
    });

    // Verify reminder was stored
    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].reminder_type).toBe("expiring_soon");
    expect(reminders[0].certification_id).toBe("cert-2");
  });

  it("should send missing certification reminder", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const reminderStore = CertificationReminderStore.make();

    // Create test data
    await roleStore.createRole({
      name: "Crew Member",
      description: "Basic crew member role",
      allowed_tracks: ["BLS"],
    });

    await trackStore.createTrack({
      name: "BLS",
      description: "Basic Life Support track",
      required_certifications: ["CPR", "First Aid"],
    });

    await certificationTypeStore.createCertificationType({
      name: "CPR",
      description: "CPR certification",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: "First Aid",
      description: "First Aid certification",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Bob",
      last_name: "Johnson",
      email: "bob@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // User has no certifications uploaded

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Verify emails were sent for both missing certifications
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).toHaveBeenCalledTimes(2);
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: "bob@example.com",
      }),
      certificationName: "CPR",
    });
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: "bob@example.com",
      }),
      certificationName: "First Aid",
    });

    // Verify reminders were stored
    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(2);
    expect(reminders.every((r) => r.reminder_type === "missing")).toBe(true);
  });

  it("should not send duplicate expired certification reminders", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const reminderStore = CertificationReminderStore.make();

    // Create test data
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

    const user = await userStore.createUser({
      first_name: "Alice",
      last_name: "Williams",
      email: "alice@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const yesterday = dayjs().subtract(1, "day").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-4",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: yesterday,
    });

    const certificationReminder = new CertificationReminder({ userStore });

    // Run first time
    await certificationReminder.checkAllUserCertifications();
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).toHaveBeenCalledTimes(1);

    // Clear mock
    vi.clearAllMocks();

    // Run second time (simulating cron running again)
    await certificationReminder.checkAllUserCertifications();

    // Should not send email again
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).not.toHaveBeenCalled();

    // Should still only have one reminder
    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(1);
  });

  it("should not send duplicate expiring soon reminders", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const reminderStore = CertificationReminderStore.make();

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

    const user = await userStore.createUser({
      first_name: "Charlie",
      last_name: "Brown",
      email: "charlie@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const twoMonthsFromNow = dayjs().add(2, "months").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-5",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(1, "year").toISOString(),
      expires_on: twoMonthsFromNow,
    });

    const certificationReminder = new CertificationReminder({ userStore });

    // Run first time
    await certificationReminder.checkAllUserCertifications();
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Run second time
    await certificationReminder.checkAllUserCertifications();

    // Should not send email again
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).not.toHaveBeenCalled();

    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(1);
  });

  it("should not send duplicate missing certification reminders", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const reminderStore = CertificationReminderStore.make();

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

    const user = await userStore.createUser({
      first_name: "Diana",
      last_name: "Prince",
      email: "diana@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const certificationReminder = new CertificationReminder({ userStore });

    // Run first time
    await certificationReminder.checkAllUserCertifications();
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Run second time
    await certificationReminder.checkAllUserCertifications();

    // Should not send email again
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).not.toHaveBeenCalled();

    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(1);
  });

  it("should not send reminder for certification expiring in 4 months", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

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

    const user = await userStore.createUser({
      first_name: "Eve",
      last_name: "Adams",
      email: "eve@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create certification expiring in 4 months (outside the 3-month window)
    const fourMonthsFromNow = dayjs().add(4, "months").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-7",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(8, "months").toISOString(),
      expires_on: fourMonthsFromNow,
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Should not send any emails
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).not.toHaveBeenCalled();
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).not.toHaveBeenCalled();
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("should not send reminder for valid current certification", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

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

    const user = await userStore.createUser({
      first_name: "Frank",
      last_name: "Miller",
      email: "frank@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create valid certification expiring in 1 year
    const oneYearFromNow = dayjs().add(1, "year").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-8",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: oneYearFromNow,
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Should not send any emails
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).not.toHaveBeenCalled();
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).not.toHaveBeenCalled();
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).not.toHaveBeenCalled();
  });

  it("should handle multiple users with different certification states", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();

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

    // User with expired cert
    const user1 = await userStore.createUser({
      first_name: "User",
      last_name: "Nine",
      email: "user9@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: "cert-9",
      user_id: user1.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: dayjs().subtract(1, "day").toISOString(),
    });

    // User with expiring soon cert
    const user2 = await userStore.createUser({
      first_name: "User",
      last_name: "Ten",
      email: "user10@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    await certificationStore.createCertification({
      certification_id: "cert-10",
      user_id: user2.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(1, "year").toISOString(),
      expires_on: dayjs().add(2, "months").toISOString(),
    });

    // User with missing cert
    const user3 = await userStore.createUser({
      first_name: "User",
      last_name: "Eleven",
      email: "user11@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Verify correct emails were sent
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).toHaveBeenCalledTimes(1);
    expect(
      EmailService.prototype.sendCertificationExpiringSoonEmail,
    ).toHaveBeenCalledTimes(1);
    expect(
      EmailService.prototype.sendMissingCertificationEmail,
    ).toHaveBeenCalledTimes(1);
  });

  it("should not save reminder when email sending fails", async () => {
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const certificationStore = CertificationStore.make();
    const reminderStore = CertificationReminderStore.make();

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

    const user = await userStore.createUser({
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      website_role: "user",
      membership_roles: [
        { role_name: "Crew Member", track_name: "BLS", precepting: false },
      ],
    });

    // Create expired certification
    const yesterday = dayjs().subtract(1, "day").toISOString();
    await certificationStore.createCertification({
      certification_id: "cert-fail",
      user_id: user.user_id,
      certification_type_name: "CPR",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: yesterday,
    });

    // Mock email service to throw an error
    vi.spyOn(
      EmailService.prototype,
      "sendCertificationExpiredEmail",
    ).mockRejectedValue(new Error("Email service unavailable"));

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    // Verify email was attempted
    expect(
      EmailService.prototype.sendCertificationExpiredEmail,
    ).toHaveBeenCalledTimes(1);

    // Verify NO reminder was saved due to email failure
    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders).toHaveLength(0);
  });
});
