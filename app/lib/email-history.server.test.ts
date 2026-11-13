import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import { EmailEventStore } from "./email-event-store";
import {
  EMAIL_HISTORY_PAGE_SIZE,
  loadEmailHistory,
} from "./email-history.server";

describe("loadEmailHistory", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("returns only the fields the profile page shows", async () => {
    const store = EmailEventStore.make();
    await store.createSentEmailEvent({
      messageId: "msg-1",
      toEmails: ["member@example.com"],
      subject: "Your certification is expiring",
      sourceEmail: "from@example.com",
      sentAt: "2026-06-01T00:00:00.000Z",
      tags: { campaign: ["reminders"] },
    });
    await store.upsertStatusFromSesCallback({
      messageId: "msg-1",
      eventType: "Bounce",
      eventAt: "2026-06-01T00:00:05.000Z",
      toEmails: ["member@example.com"],
      bounceType: "Permanent",
      details: { ses_bounce_diagnostic: "smtp; 550 mailbox unavailable" },
    });

    const page = await loadEmailHistory("member@example.com");

    expect(page).toEqual({
      emails: [
        {
          message_id: "msg-1",
          subject: "Your certification is expiring",
          status: "Bounce",
          sent_at: "2026-06-01T00:00:00.000Z",
          bounce_type: "Permanent",
          events: [
            { event_type: "SEND", event_at: "2026-06-01T00:00:00.000Z" },
            { event_type: "Bounce", event_at: "2026-06-01T00:00:05.000Z" },
          ],
        },
      ],
      cursor: undefined,
    });
  });

  it("loads the next page with the returned cursor", async () => {
    const store = EmailEventStore.make();
    const total = EMAIL_HISTORY_PAGE_SIZE + 3;
    for (let i = 0; i < total; i++) {
      const sentAt = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
      await store.createSentEmailEvent({
        messageId: `msg-${String(i).padStart(3, "0")}`,
        toEmails: ["member@example.com"],
        subject: `Email ${i}`,
        sentAt,
      });
    }

    const first = await loadEmailHistory("member@example.com");
    expect(first.emails).toHaveLength(EMAIL_HISTORY_PAGE_SIZE);
    expect(first.emails[0]!.message_id).toBe("msg-102");
    expect(first.cursor).toEqual(expect.any(String));

    const second = await loadEmailHistory("member@example.com", first.cursor);
    expect(second.emails.map((e) => e.message_id)).toEqual([
      "msg-002",
      "msg-001",
      "msg-000",
    ]);
    expect(second.cursor).toBeUndefined();
  });

  it("rejects a malformed cursor", async () => {
    expect(
      await loadEmailHistory("member@example.com", "not-a-cursor"),
    ).toEqual({ emails: [], error: "Invalid page token" });
  });

  it("won't page through another recipient's emails", async () => {
    const store = EmailEventStore.make();
    for (let i = 0; i <= EMAIL_HISTORY_PAGE_SIZE; i++) {
      await store.createSentEmailEvent({
        messageId: `msg-${i}`,
        toEmails: ["someone-else@example.com"],
        subject: `Email ${i}`,
        sentAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      });
    }
    const theirs = await loadEmailHistory("someone-else@example.com");
    expect(theirs.cursor).toBeDefined();

    const page = await loadEmailHistory("member@example.com", theirs.cursor);
    expect(page.emails).toEqual([]);
    expect(page.error).toBeDefined();
  });
});
