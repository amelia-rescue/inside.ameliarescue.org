import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import { EmailEventStore, EmailEventNotFound } from "./email-event-store";

describe("email event store", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("creates a sent email event and retrieves it", async () => {
    const store = EmailEventStore.make();

    const created = await store.createSentEmailEvent({
      messageId: "msg-1",
      toEmails: ["to@example.com"],
      subject: "Hello",
      sourceEmail: "from@example.com",
      sentAt: "2026-01-01T00:00:00.000Z",
    });

    expect(created).toMatchObject({
      message_id: "msg-1",
      origin: "app",
      status: "SEND",
      to_emails: ["to@example.com"],
      subject: "Hello",
      source_email: "from@example.com",
      sent_at: "2026-01-01T00:00:00.000Z",
      last_event_at: "2026-01-01T00:00:00.000Z",
      last_event_type: "SEND",
    });
    expect(created.events).toHaveLength(1);

    const retrieved = await store.getEmailEvent("msg-1");
    expect(retrieved.message_id).toBe("msg-1");
  });

  it("throws EmailEventNotFound for missing message ids", async () => {
    const store = EmailEventStore.make();
    await expect(store.getEmailEvent("nope")).rejects.toBeInstanceOf(
      EmailEventNotFound,
    );
  });

  it("updates an existing app-sent record from an SES delivery callback", async () => {
    const store = EmailEventStore.make();

    await store.createSentEmailEvent({
      messageId: "msg-2",
      toEmails: ["to@example.com"],
      subject: "Hello",
      sourceEmail: "from@example.com",
      sentAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = await store.upsertStatusFromSesCallback({
      messageId: "msg-2",
      eventType: "Delivery",
      eventAt: "2026-01-01T00:00:05.000Z",
      snsMessageId: "sns-1",
      toEmails: ["to@example.com"],
      subject: "Hello",
      sourceEmail: "from@example.com",
    });

    expect(updated).toMatchObject({
      message_id: "msg-2",
      origin: "app",
      status: "Delivery",
      last_event_type: "Delivery",
      last_event_at: "2026-01-01T00:00:05.000Z",
      last_sns_message_id: "sns-1",
    });
    expect(updated.events).toHaveLength(2);
    expect(updated.events[1]).toMatchObject({
      event_type: "Delivery",
      event_at: "2026-01-01T00:00:05.000Z",
    });
  });

  it("upserts a callback-only record when no prior app send exists", async () => {
    const store = EmailEventStore.make();

    const upserted = await store.upsertStatusFromSesCallback({
      messageId: "msg-cognito",
      eventType: "Delivery",
      eventAt: "2026-01-02T00:00:00.000Z",
      toEmails: ["user@example.com"],
      subject: "Your authentication code",
      sourceEmail: "noreply@inside.ameliarescue.org",
      origin: "cognito",
    });

    expect(upserted).toMatchObject({
      message_id: "msg-cognito",
      origin: "cognito",
      status: "Delivery",
      to_emails: ["user@example.com"],
      subject: "Your authentication code",
    });

    const retrieved = await store.getEmailEvent("msg-cognito");
    expect(retrieved.status).toBe("Delivery");
  });

  it("handles callback events that omit optional fields without throwing", async () => {
    const store = EmailEventStore.make();

    await store.createSentEmailEvent({
      messageId: "msg-delivery-only",
      toEmails: ["to@example.com"],
      subject: "Hi",
      sourceEmail: "from@example.com",
      sentAt: "2026-01-03T00:00:00.000Z",
    });

    await expect(
      store.upsertStatusFromSesCallback({
        messageId: "msg-delivery-only",
        eventType: "Delivery",
        eventAt: "2026-01-03T00:00:10.000Z",
        toEmails: ["to@example.com"],
      }),
    ).resolves.toMatchObject({
      status: "Delivery",
      last_event_type: "Delivery",
    });
  });

  it("stores bounce-specific fields when present in the callback", async () => {
    const store = EmailEventStore.make();

    await store.createSentEmailEvent({
      messageId: "msg-bounce",
      toEmails: ["to@example.com"],
      subject: "Hi",
      sourceEmail: "from@example.com",
      sentAt: "2026-01-04T00:00:00.000Z",
    });

    const updated = await store.upsertStatusFromSesCallback({
      messageId: "msg-bounce",
      eventType: "Bounce",
      eventAt: "2026-01-04T00:00:05.000Z",
      toEmails: ["to@example.com"],
      bounceType: "Permanent",
      bounceSubType: "General",
    });

    expect(updated).toMatchObject({
      status: "Bounce",
      bounce_type: "Permanent",
      bounce_sub_type: "General",
    });
  });

  it("lists recent email events ordered by most recent first", async () => {
    const store = EmailEventStore.make();

    await store.createSentEmailEvent({
      messageId: "msg-a",
      toEmails: ["a@example.com"],
      subject: "A",
      sentAt: "2026-02-01T00:00:00.000Z",
    });
    await store.createSentEmailEvent({
      messageId: "msg-b",
      toEmails: ["b@example.com"],
      subject: "B",
      sentAt: "2026-02-02T00:00:00.000Z",
    });
    await store.createSentEmailEvent({
      messageId: "msg-c",
      toEmails: ["c@example.com"],
      subject: "C",
      sentAt: "2026-02-03T00:00:00.000Z",
    });

    const recent = await store.listRecentEmailEvents(10);
    expect(recent.map((e) => e.message_id)).toEqual([
      "msg-c",
      "msg-b",
      "msg-a",
    ]);
  });

  it("respects the listRecentEmailEvents limit", async () => {
    const store = EmailEventStore.make();

    await store.createSentEmailEvent({
      messageId: "msg-1",
      toEmails: ["a@example.com"],
      subject: "A",
      sentAt: "2026-03-01T00:00:00.000Z",
    });
    await store.createSentEmailEvent({
      messageId: "msg-2",
      toEmails: ["b@example.com"],
      subject: "B",
      sentAt: "2026-03-02T00:00:00.000Z",
    });

    const recent = await store.listRecentEmailEvents(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.message_id).toBe("msg-2");
  });
});
