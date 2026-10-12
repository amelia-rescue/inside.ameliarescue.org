import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "../dynamo-local";
import { EmailService } from "../email-service";
import { UserStore } from "../user-store";
import { TruckCheckSchemaStore } from "./truck-check-schema-store";
import {
  notifyTruckCheckIssues,
  type NotifiableTruckCheck,
} from "./issue-notifications";

function subscriber(email: string) {
  return { email } as any;
}

describe("truck check issue notifications test", () => {
  let dynamo: DynaliteServer;
  let schemaStore: TruckCheckSchemaStore;
  let sendEmailSpy: any;
  let schemaId: string;
  let schemaCreatedAt: string;

  beforeEach(async () => {
    dynamo = await setupDynamo();
    schemaStore = TruckCheckSchemaStore.make();

    const schema = await schemaStore.createSchema({
      version: 1,
      title: "Medic 1 check",
      created_by: "user-123",
      sections: [
        {
          id: "cab",
          title: "Cab",
          fields: [
            { type: "checkbox", label: "Flashlight" },
            { type: "text", label: "Notes", reportableIssue: true },
            { type: "photo", label: "Damage photos" },
          ],
        },
      ],
    });
    schemaId = schema.schemaId;
    schemaCreatedAt = schema.createdAt;

    await schemaStore.createTruck({
      truckId: "medic-1",
      displayName: "Medic 1",
      schemaId,
    });

    sendEmailSpy = vi
      .spyOn(EmailService.prototype, "sendTruckCheckIssuesEmail")
      .mockResolvedValue();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
    vi.restoreAllMocks();
  });

  function check(
    data: Record<string, unknown>,
    overrides: Partial<NotifiableTruckCheck> = {},
  ): NotifiableTruckCheck {
    return {
      id: "check-1",
      truck: "medic-1",
      created_at: "2026-01-01T12:00:00.000Z",
      data,
      schema_id: schemaId,
      schema_created_at: schemaCreatedAt,
      ...overrides,
    };
  }

  it("renders explanations and per-item attribution safely in both email formats", async () => {
    sendEmailSpy.mockRestore();
    const send = vi
      .spyOn(EmailService.prototype as any, "sendEmail")
      .mockResolvedValue(undefined);
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([subscriber("chief@example.com")]);
    const editor = {
      userId: "alex",
      first_name: "Alex",
      last_name: "<Medic>",
      updatedAt: "2026-10-12T13:00:00Z",
    };
    await notifyTruckCheckIssues({
      checks: [
        check(
          { "cab-flashlight": "not-present", "cab-notes": "Low tire" },
          {
            field_notes: { "cab-flashlight": "Only one <pack> & no spares" },
            field_updates: { "cab-flashlight": editor, "cab-notes": editor },
          },
        ),
      ],
    });
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0][0] as {
      htmlBody: string;
      textBody: string;
    };
    expect(email.htmlBody).toContain("Only one &lt;pack&gt; &amp; no spares");
    expect(email.htmlBody).toContain("Last updated by Alex &lt;Medic&gt;");
    expect(email.htmlBody).not.toContain("<pack>");
    expect(email.textBody).toContain("Only one <pack> & no spares");
    expect(email.textBody).toContain("Last updated by Alex <Medic>");
  });

  it("emails every subscriber about a check with issues", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([
      subscriber("chief@example.com"),
      subscriber("captain@example.com"),
    ]);

    await notifyTruckCheckIssues({
      checks: [
        check({
          "cab-flashlight": "not-present",
          "cab-notes": "Left rear tire is low",
          "cab-damage-photos": ["https://example.com/photo.jpg"],
        }),
      ],
    });

    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "chief@example.com",
        truckName: "Medic 1",
        checkId: "check-1",
        checkedAt: "2026-01-01T12:00:00.000Z",
        problemSections: [
          {
            sectionTitle: "Cab",
            fields: [{ fieldId: "cab-flashlight", label: "Flashlight" }],
          },
        ],
        textNotes: [
          {
            fieldId: "cab-notes",
            sectionTitle: "Cab",
            label: "Notes",
            value: "Left rear tire is low",
          },
        ],
        photos: [
          {
            fieldId: "cab-damage-photos",
            sectionTitle: "Cab",
            label: "Damage photos",
            urls: ["https://example.com/photo.jpg"],
          },
        ],
      }),
    );
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "captain@example.com" }),
    );
  });

  it("skips checks without issues", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([subscriber("chief@example.com")]);

    await notifyTruckCheckIssues({
      checks: [
        check({
          "cab-flashlight": true,
          "cab-damage-photos": ["https://example.com/photo.jpg"],
        }),
      ],
    });

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("sends nothing when nobody is subscribed", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([]);

    await notifyTruckCheckIssues({
      checks: [check({ "cab-flashlight": "not-present" })],
    });

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("keeps going when one email fails", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([
      subscriber("broken@example.com"),
      subscriber("chief@example.com"),
    ]);
    sendEmailSpy.mockRejectedValueOnce(new Error("SES is down"));

    await notifyTruckCheckIssues({
      checks: [check({ "cab-flashlight": "not-present" })],
    });

    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    expect(sendEmailSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ toEmail: "chief@example.com" }),
    );
  });

  it("falls back to the truck's active schema when the check has no schema version", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([subscriber("chief@example.com")]);

    await notifyTruckCheckIssues({
      checks: [
        check(
          { "cab-flashlight": "not-present" },
          { schema_id: undefined, schema_created_at: undefined },
        ),
      ],
    });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ truckName: "Medic 1" }),
    );
  });

  it("skips checks whose schema cannot be resolved", async () => {
    vi.spyOn(
      UserStore.prototype,
      "listTruckCheckIssueSubscribers",
    ).mockResolvedValue([subscriber("chief@example.com")]);

    await notifyTruckCheckIssues({
      checks: [
        check(
          { "cab-flashlight": "not-present" },
          { schema_id: "missing", schema_created_at: schemaCreatedAt },
        ),
      ],
    });

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });
});
