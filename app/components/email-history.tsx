import { useEffect, useState } from "react";
import { useFetcher, type ShouldRevalidateFunctionArgs } from "react-router";
import { DateDisplay } from "~/components/date-display";
import type {
  EmailHistoryEntry,
  EmailHistoryPage,
} from "~/lib/email-history.server";

export const LOAD_MORE_EMAILS_INTENT = "load-more-emails";

/**
 * For a route's `shouldRevalidate`: loading another page of emails changes
 * nothing else on the page, and reloading would reset the list to page one.
 */
export function shouldRevalidateEmailHistory({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formData?.get("intent") === LOAD_MORE_EMAILS_INTENT) {
    return false;
  }
  return defaultShouldRevalidate;
}

const EVENT_LABELS: Record<string, { label: string; badge: string }> = {
  SEND: { label: "Sent", badge: "badge-ghost" },
  Send: { label: "Sent", badge: "badge-ghost" },
  Delivery: { label: "Delivered", badge: "badge-success" },
  Open: { label: "Opened", badge: "badge-success" },
  Click: { label: "Clicked", badge: "badge-success" },
  DeliveryDelay: { label: "Delayed", badge: "badge-warning" },
  Bounce: { label: "Bounced", badge: "badge-error" },
  Complaint: { label: "Marked as spam", badge: "badge-error" },
  Reject: { label: "Rejected", badge: "badge-error" },
  "Rendering Failure": { label: "Failed", badge: "badge-error" },
};

function describeEvent(eventType: string) {
  return EVENT_LABELS[eventType] ?? { label: eventType, badge: "badge-ghost" };
}

function StatusBadge({ status }: { status: string }) {
  const { label, badge } = describeEvent(status);
  return (
    <span className={`badge badge-sm whitespace-nowrap ${badge}`}>{label}</span>
  );
}

function EmailRow({
  email,
  isOwnHistory,
}: {
  email: EmailHistoryEntry;
  isOwnHistory: boolean;
}) {
  return (
    <details className="collapse-arrow bg-base-200 collapse">
      <summary className="collapse-title flex flex-col gap-1 pe-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="min-w-0 font-medium break-words sm:truncate">
          {email.subject || "(no subject)"}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm">
          <span className="opacity-60">
            <DateDisplay value={email.sent_at} format="mediumDate" />
          </span>
          <StatusBadge status={email.status} />
        </span>
      </summary>
      <div className="collapse-content">
        <ul className="flex flex-col gap-2 text-sm">
          {email.events.map((event, index) => (
            <li
              key={`${event.event_type}-${event.event_at}-${index}`}
              className="flex items-center justify-between gap-3"
            >
              <span>{describeEvent(event.event_type).label}</span>
              <span className="opacity-60">
                <DateDisplay value={event.event_at} format="M/D/YYYY h:mm A" />
              </span>
            </li>
          ))}
        </ul>
        {email.status === "Bounce" && (
          <p className="mt-3 text-sm opacity-70">
            {email.bounce_type === "Permanent"
              ? isOwnHistory
                ? "Your mail server rejected this email permanently. Check that your email address is correct."
                : "The recipient's mail server rejected this email permanently. Check that their email address is correct."
              : isOwnHistory
                ? "Your mail server couldn't accept this email at the time."
                : "The recipient's mail server couldn't accept this email at the time."}
          </p>
        )}
      </div>
    </details>
  );
}

export function EmailHistory({
  initial,
  recipientName,
}: {
  initial: EmailHistoryPage;
  /** Set when showing someone else's emails, e.g. to an admin. */
  recipientName?: string;
}) {
  const isOwnHistory = recipientName === undefined;
  const fetcher = useFetcher<{ emailHistory?: EmailHistoryPage }>();
  const [emails, setEmails] = useState(initial.emails);
  const [cursor, setCursor] = useState(initial.cursor);
  const [loadError, setLoadError] = useState<string | undefined>();

  useEffect(() => {
    setEmails(initial.emails);
    setCursor(initial.cursor);
    setLoadError(undefined);
  }, [initial]);

  useEffect(() => {
    const page = fetcher.data?.emailHistory;
    if (!page) return;
    if (page.error) {
      setLoadError(page.error);
      return;
    }
    setLoadError(undefined);
    setEmails((prev) => {
      const seen = new Set(prev.map((email) => email.message_id));
      return [...prev, ...page.emails.filter((e) => !seen.has(e.message_id))];
    });
    setCursor(page.cursor);
  }, [fetcher.data]);

  const countLabel = cursor ? `${emails.length}+` : String(emails.length);

  return (
    <details className="collapse-arrow bg-base-100 collapse shadow">
      <summary className="collapse-title">
        <span className="card-title">
          Emails Sent
          {!initial.error && (
            <span className="badge badge-sm badge-ghost">{countLabel}</span>
          )}
        </span>
      </summary>
      <div className="collapse-content flex flex-col gap-2">
        {initial.error ? (
          <div className="alert alert-warning">{initial.error}</div>
        ) : emails.length === 0 ? (
          <p className="py-4 text-center opacity-60">
            No emails have been sent to {isOwnHistory ? "you" : recipientName}{" "}
            yet.
          </p>
        ) : (
          emails.map((email) => (
            <EmailRow
              key={email.message_id}
              email={email}
              isOwnHistory={isOwnHistory}
            />
          ))
        )}

        {loadError && <div className="alert alert-warning">{loadError}</div>}

        {cursor && (
          <button
            type="button"
            className="btn btn-outline border-base-content mt-2 self-start border-2"
            disabled={fetcher.state !== "idle"}
            onClick={() =>
              fetcher.submit(
                { intent: LOAD_MORE_EMAILS_INTENT, cursor },
                { method: "post" },
              )
            }
          >
            {fetcher.state !== "idle" ? "Loading…" : "Load more emails"}
          </button>
        )}
      </div>
    </details>
  );
}
