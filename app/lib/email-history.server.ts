import { ArkErrors, type } from "arktype";
import {
  EmailEventStore,
  type RecipientEmailCursor,
} from "./email-event-store";
import { log } from "./logger";

export const EMAIL_HISTORY_PAGE_SIZE = 100;

/**
 * What the profile page shows for one email. Deliberately leaves out SES
 * event details (SNS metadata, diagnostic codes, tags) so they never reach
 * the browser.
 */
export interface EmailHistoryEntry {
  message_id: string;
  subject?: string;
  status: string;
  sent_at?: string;
  bounce_type?: string;
  events: { event_type: string; event_at: string }[];
}

export interface EmailHistoryPage {
  emails: EmailHistoryEntry[];
  /** Opaque token for the next page; absent when there are no more emails. */
  cursor?: string;
  error?: string;
}

const cursorSchema = type({
  message_id: "string",
  recipient_email: "string",
  list_sort: "string",
});
cursorSchema.onUndeclaredKey("delete");

function encodeCursor(cursor: RecipientEmailCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(token: string): RecipientEmailCursor | null {
  try {
    const parsed = cursorSchema(
      JSON.parse(Buffer.from(token, "base64url").toString("utf8")),
    );
    return parsed instanceof ArkErrors ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Loads one page of the emails sent to `email`. Errors are logged and
 * returned as `error` so a failed lookup never breaks the profile page.
 */
export async function loadEmailHistory(
  email: string,
  cursorToken?: string | null,
): Promise<EmailHistoryPage> {
  let cursor: RecipientEmailCursor | undefined;
  if (cursorToken) {
    const decoded = decodeCursor(cursorToken);
    if (!decoded) {
      return { emails: [], error: "Invalid page token" };
    }
    cursor = decoded;
  }

  try {
    const page = await EmailEventStore.make().listEmailEventsByRecipient(
      email,
      { limit: EMAIL_HISTORY_PAGE_SIZE, cursor },
    );

    return {
      emails: page.emailEvents.map((event) => ({
        message_id: event.message_id,
        subject: event.subject,
        status: event.status,
        sent_at: event.sent_at ?? event.events[0]?.event_at,
        bounce_type: event.bounce_type,
        events: event.events.map(({ event_type, event_at }) => ({
          event_type,
          event_at,
        })),
      })),
      cursor: page.cursor ? encodeCursor(page.cursor) : undefined,
    };
  } catch (error) {
    log.error("Failed to load email history", { error });
    return { emails: [], error: "Couldn't load your emails right now." };
  }
}
