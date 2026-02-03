import { describe, it, expect } from "vitest";
import {
  CertificationReminderStore,
  CertificationReminderNotFound,
  CertificationReminderAlreadyExists,
} from "./certification-reminder-store";

describe("certification reminder store test", () => {
  it("should be able to create and get a reminder", async () => {
    const store = CertificationReminderStore.make();
    const reminderId = `reminder-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    const certId = `cert-${crypto.randomUUID()}`;

    const reminder = await store.createReminder({
      reminder_id: reminderId,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
      email_sent: true,
    });

    expect(reminder).toMatchObject({
      reminder_id: reminderId,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
      email_sent: true,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getReminder(reminderId);
    expect(retrieved).toMatchObject({
      reminder_id: reminderId,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
    });
  });

  it("should throw CertificationReminderNotFound when getting a non-existent reminder", async () => {
    const store = CertificationReminderStore.make();

    await expect(store.getReminder("non-existent")).rejects.toBeInstanceOf(
      CertificationReminderNotFound,
    );
  });

  it("should throw CertificationReminderAlreadyExists when creating a duplicate", async () => {
    const store = CertificationReminderStore.make();
    const reminderId = `reminder-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: reminderId,
      user_id: "user-456",
      certification_id: "cert-789",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await expect(
      store.createReminder({
        reminder_id: reminderId,
        user_id: "user-999",
        certification_id: "cert-999",
        reminder_type: "expiring_soon",
        sent_at: "2024-01-02T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(CertificationReminderAlreadyExists);
  });

  it("should support all reminder types", async () => {
    const store = CertificationReminderStore.make();
    const userId = `user-${crypto.randomUUID()}`;

    const expiredReminder = await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: "cert-1",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });
    expect(expiredReminder.reminder_type).toBe("expired");

    const expiringSoonReminder = await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: "cert-2",
      reminder_type: "expiring_soon",
      sent_at: "2024-01-02T00:00:00Z",
    });
    expect(expiringSoonReminder.reminder_type).toBe("expiring_soon");

    const missingReminder = await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: "missing-EMT-Basic",
      reminder_type: "missing",
      sent_at: "2024-01-03T00:00:00Z",
    });
    expect(missingReminder.reminder_type).toBe("missing");
  });

  it("should be able to get reminders by user and certification", async () => {
    const store = CertificationReminderStore.make();
    const userId = `user-${crypto.randomUUID()}`;
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-08T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: "cert-789",
      reminder_type: "expiring_soon",
      sent_at: "2024-01-05T00:00:00Z",
    });

    const reminders = await store.getRemindersByUserAndCertification(
      userId,
      certId,
    );

    expect(reminders.length).toBe(2);
    expect(reminders[0].sent_at).toBe("2024-01-08T00:00:00Z");
    expect(reminders[1].sent_at).toBe("2024-01-01T00:00:00Z");
  });

  it("should return empty array when no reminders exist for user and certification", async () => {
    const store = CertificationReminderStore.make();

    const reminders = await store.getRemindersByUserAndCertification(
      "user-999",
      "cert-999",
    );

    expect(reminders).toEqual([]);
  });

  it("should be able to get all reminders by user", async () => {
    const store = CertificationReminderStore.make();
    const user1 = `user-${crypto.randomUUID()}`;
    const user2 = `user-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: user1,
      certification_id: "cert-1",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: user1,
      certification_id: "cert-2",
      reminder_type: "expiring_soon",
      sent_at: "2024-01-02T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: user2,
      certification_id: "cert-3",
      reminder_type: "missing",
      sent_at: "2024-01-03T00:00:00Z",
    });

    const user1Reminders = await store.getRemindersByUser(user1);
    expect(user1Reminders.length).toBe(2);

    const user2Reminders = await store.getRemindersByUser(user2);
    expect(user2Reminders.length).toBe(1);
    expect(user2Reminders[0].reminder_type).toBe("missing");
  });

  it("should be able to list all reminders", async () => {
    const store = CertificationReminderStore.make();
    const testId = crypto.randomUUID();

    await store.createReminder({
      reminder_id: `reminder-${testId}-1`,
      user_id: "user-123",
      certification_id: "cert-1",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${testId}-2`,
      user_id: "user-456",
      certification_id: "cert-2",
      reminder_type: "expiring_soon",
      sent_at: "2024-01-02T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${testId}-3`,
      user_id: "user-789",
      certification_id: "cert-3",
      reminder_type: "missing",
      sent_at: "2024-01-03T00:00:00Z",
    });

    const allReminders = await store.listAllReminders();
    expect(allReminders.length).toBeGreaterThanOrEqual(3);
  });

  it("should be able to update a reminder", async () => {
    const store = CertificationReminderStore.make();
    const reminderId = `reminder-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: reminderId,
      user_id: "user-456",
      certification_id: "cert-789",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
      email_sent: false,
    });

    const updated = await store.updateReminder({
      reminder_id: reminderId,
      user_id: "user-456",
      certification_id: "cert-789",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
      email_sent: true,
      sms_sent: true,
    });

    expect(updated.email_sent).toBe(true);
    expect(updated.sms_sent).toBe(true);
    expect(updated.updated_at).not.toBe(updated.created_at);
  });

  it("should throw CertificationReminderNotFound when updating a non-existent reminder", async () => {
    const store = CertificationReminderStore.make();

    await expect(
      store.updateReminder({
        reminder_id: "non-existent",
        user_id: "user-456",
        certification_id: "cert-789",
        reminder_type: "expired",
        sent_at: "2024-01-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(CertificationReminderNotFound);
  });

  it("should be able to delete a reminder", async () => {
    const store = CertificationReminderStore.make();
    const reminderId = `reminder-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: reminderId,
      user_id: "user-456",
      certification_id: "cert-789",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await store.deleteReminder(reminderId);

    await expect(store.getReminder(reminderId)).rejects.toBeInstanceOf(
      CertificationReminderNotFound,
    );
  });

  it("should throw CertificationReminderNotFound when deleting a non-existent reminder", async () => {
    const store = CertificationReminderStore.make();

    await expect(store.deleteReminder("non-existent")).rejects.toBeInstanceOf(
      CertificationReminderNotFound,
    );
  });

  it("should handle optional email_sent and sms_sent fields", async () => {
    const store = CertificationReminderStore.make();

    const withFlags = await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: "user-456",
      certification_id: "cert-789",
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
      email_sent: true,
      sms_sent: false,
    });

    expect(withFlags.email_sent).toBe(true);
    expect(withFlags.sms_sent).toBe(false);

    const withoutFlags = await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: "user-456",
      certification_id: "cert-123",
      reminder_type: "missing",
      sent_at: "2024-01-01T00:00:00Z",
    });

    expect(withoutFlags.email_sent).toBeUndefined();
    expect(withoutFlags.sms_sent).toBeUndefined();
  });

  it("should correctly check if reminder of type exists", async () => {
    const store = CertificationReminderStore.make();
    const userId = `user-${crypto.randomUUID()}`;
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    const hasExpiredReminder = await store.hasReminderOfType(
      userId,
      certId,
      "expired",
    );
    expect(hasExpiredReminder).toBe(true);

    const hasExpiringSoonReminder = await store.hasReminderOfType(
      userId,
      certId,
      "expiring_soon",
    );
    expect(hasExpiringSoonReminder).toBe(false);
  });

  it("should return false when checking for reminders with no reminders", async () => {
    const store = CertificationReminderStore.make();

    const hasReminder = await store.hasReminderOfType(
      "user-999",
      "cert-999",
      "expired",
    );

    expect(hasReminder).toBe(false);
  });

  it("should only check reminders of the same type", async () => {
    const store = CertificationReminderStore.make();
    const userId = `user-${crypto.randomUUID()}`;
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: certId,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    const hasExpired = await store.hasReminderOfType(
      userId,
      certId,
      "expired",
    );
    expect(hasExpired).toBe(true);

    const hasExpiring = await store.hasReminderOfType(
      userId,
      certId,
      "expiring_soon",
    );
    expect(hasExpiring).toBe(false);
  });

  it("should handle multiple reminders for different certifications of the same user", async () => {
    const store = CertificationReminderStore.make();
    const userId = `user-${crypto.randomUUID()}`;
    const cert1 = `cert-${crypto.randomUUID()}`;
    const cert2 = `cert-${crypto.randomUUID()}`;
    const cert3 = `cert-${crypto.randomUUID()}`;

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: cert1,
      reminder_type: "expired",
      sent_at: "2024-01-01T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: cert2,
      reminder_type: "expiring_soon",
      sent_at: "2024-01-02T00:00:00Z",
    });

    await store.createReminder({
      reminder_id: `reminder-${crypto.randomUUID()}`,
      user_id: userId,
      certification_id: cert3,
      reminder_type: "missing",
      sent_at: "2024-01-03T00:00:00Z",
    });

    const cert1Reminders = await store.getRemindersByUserAndCertification(
      userId,
      cert1,
    );
    expect(cert1Reminders.length).toBe(1);
    expect(cert1Reminders[0].reminder_type).toBe("expired");

    const cert2Reminders = await store.getRemindersByUserAndCertification(
      userId,
      cert2,
    );
    expect(cert2Reminders.length).toBe(1);
    expect(cert2Reminders[0].reminder_type).toBe("expiring_soon");

    const allUserReminders = await store.getRemindersByUser(userId);
    expect(allUserReminders.length).toBe(3);
  });
});
