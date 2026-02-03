import { describe, it, expect, vi, afterEach } from "vitest";
import { CertificationReminder } from "./certification-reminder";
import { UserStore } from "../user-store";
import { RoleStore } from "../role-store";
import { TrackStore } from "../track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { CertificationStore } from "./certification-store";
import { CertificationReminderStore } from "./certification-reminder-store";
import { EmailService } from "../email-service";
import dayjs from "dayjs";

describe("certification reminder test", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should send expired certification reminder", async () => {
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
    const reminderStore = CertificationReminderStore.make();

    vi.spyOn(EmailService.prototype, "sendCertificationExpiredEmail").mockResolvedValue();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`, `First Aid-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: `First Aid-${testId}`,
      description: "First Aid certification",
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

    const yesterday = dayjs().subtract(1, "day").toISOString();
    await certificationStore.createCertification({
      certification_id: `cert-${testId}`,
      user_id: user.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: yesterday,
    });

    await certificationStore.createCertification({
      certification_id: `cert-${testId}-b`,
      user_id: user.user_id,
      certification_type_name: `First Aid-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    expect(EmailService.prototype.sendCertificationExpiredEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: `john-${testId}@example.com`,
      }),
      certificationName: `CPR-${testId}`,
      expirationDate: expect.any(String),
    });

    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    const expiredReminder = reminders.find(r => r.reminder_type === "expired");
    expect(expiredReminder).toBeDefined();
  });

  it("should send expiring soon certification reminder", async () => {
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
    const reminderStore = CertificationReminderStore.make();

    vi.spyOn(EmailService.prototype, "sendCertificationExpiringSoonEmail").mockResolvedValue();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`, `First Aid-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: `First Aid-${testId}`,
      description: "First Aid certification",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Jane",
      last_name: "Smith",
      email: `jane-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    const twoMonthsFromNow = dayjs().add(2, "months").toISOString();
    await certificationStore.createCertification({
      certification_id: `cert-${testId}`,
      user_id: user.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(1, "year").toISOString(),
      expires_on: twoMonthsFromNow,
    });

    await certificationStore.createCertification({
      certification_id: `cert-${testId}-b`,
      user_id: user.user_id,
      certification_type_name: `First Aid-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    expect(EmailService.prototype.sendCertificationExpiringSoonEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: `jane-${testId}@example.com`,
      }),
      certificationName: `CPR-${testId}`,
      expirationDate: expect.any(String),
    });

    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    const expiringSoonReminder = reminders.find(r => r.reminder_type === "expiring_soon");
    expect(expiringSoonReminder).toBeDefined();
  });

  it("should send missing certification reminder", async () => {
    const testId = crypto.randomUUID();
    const cognitoSendSpy = vi.fn().mockImplementation(async () => ({
      User: { Username: crypto.randomUUID() },
    }));
    const mockCognitoClient = { send: cognitoSendSpy } as any;
    const userStore = UserStore.make({ cognito: mockCognitoClient });
    const roleStore = RoleStore.make();
    const trackStore = TrackStore.make();
    const certificationTypeStore = CertificationTypeStore.make();
    const reminderStore = CertificationReminderStore.make();

    vi.spyOn(EmailService.prototype, "sendMissingCertificationEmail").mockResolvedValue();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`, `First Aid-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: `First Aid-${testId}`,
      description: "First Aid certification",
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

    const certificationReminder = new CertificationReminder({ userStore });
    await certificationReminder.checkAllUserCertifications();

    expect(EmailService.prototype.sendMissingCertificationEmail).toHaveBeenCalledTimes(2);
    expect(EmailService.prototype.sendMissingCertificationEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: `bob-${testId}@example.com`,
      }),
      certificationName: `CPR-${testId}`,
    });
    expect(EmailService.prototype.sendMissingCertificationEmail).toHaveBeenCalledWith({
      user: expect.objectContaining({
        user_id: user.user_id,
        email: `bob-${testId}@example.com`,
      }),
      certificationName: `First Aid-${testId}`,
    });

    const reminders = await reminderStore.getRemindersByUser(user.user_id);
    expect(reminders.length).toBeGreaterThanOrEqual(2);
    const missingReminders = reminders.filter(r => r.reminder_type === "missing");
    expect(missingReminders.length).toBeGreaterThanOrEqual(2);
  });

  it("should not send duplicate expired certification reminders", async () => {
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

    vi.spyOn(EmailService.prototype, "sendCertificationExpiredEmail").mockResolvedValue();

    await roleStore.createRole({
      name: `Crew Member-${testId}`,
      description: "Basic crew member role",
      allowed_tracks: [`BLS-${testId}`],
    });

    await trackStore.createTrack({
      name: `BLS-${testId}`,
      description: "Basic Life Support track",
      required_certifications: [`CPR-${testId}`, `First Aid-${testId}`],
    });

    await certificationTypeStore.createCertificationType({
      name: `CPR-${testId}`,
      description: "CPR certification",
      expires: true,
    });

    await certificationTypeStore.createCertificationType({
      name: `First Aid-${testId}`,
      description: "First Aid certification",
      expires: true,
    });

    const user = await userStore.createUser({
      first_name: "Alice",
      last_name: "Williams",
      email: `alice-${testId}@example.com`,
      website_role: "user",
      membership_roles: [
        { role_name: `Crew Member-${testId}`, track_name: `BLS-${testId}`, precepting: false },
      ],
    });

    const yesterday = dayjs().subtract(1, "day").toISOString();
    await certificationStore.createCertification({
      certification_id: `cert-${testId}`,
      user_id: user.user_id,
      certification_type_name: `CPR-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().subtract(2, "years").toISOString(),
      expires_on: yesterday,
    });

    await certificationStore.createCertification({
      certification_id: `cert-${testId}-b`,
      user_id: user.user_id,
      certification_type_name: `First Aid-${testId}`,
      file_url: "https://example.com/cert.pdf",
      uploaded_at: dayjs().toISOString(),
      expires_on: dayjs().add(1, "year").toISOString(),
    });

    const certificationReminder = new CertificationReminder({ userStore });

    await certificationReminder.checkAllUserCertifications();
    expect(EmailService.prototype.sendCertificationExpiredEmail).toHaveBeenCalledTimes(1);

    await certificationReminder.checkAllUserCertifications();
    expect(EmailService.prototype.sendCertificationExpiredEmail).toHaveBeenCalledTimes(1);
  });
});
