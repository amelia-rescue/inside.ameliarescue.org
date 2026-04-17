import { Link, redirect } from "react-router";
import type { Route } from "./+types/email-events";
import { appContext } from "~/context";
import { EmailEventStore, type EmailEvent } from "~/lib/email-event-store";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Email Events - Admin - Amelia Rescue" },
    { name: "description", content: "View recent email delivery events" },
  ];
}

export const handle = {
  breadcrumb: "Email Events",
};

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }

  if (c.user.website_role !== "admin") {
    throw redirect("/");
  }

  const emailEventStore = EmailEventStore.make();
  const emailEvents = await emailEventStore.listRecentEmailEvents(1000);
  return { ...c, emailEvents };
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function statusBadgeClass(status: string) {
  switch (status.toUpperCase()) {
    case "DELIVERY":
      return "badge-success";
    case "BOUNCE":
    case "COMPLAINT":
    case "REJECT":
    case "DELIVERYDELAY":
    case "DELIVERY_DELAY":
    case "RENDERING FAILURE":
    case "RENDERING_FAILURE":
      return "badge-warning";
    default:
      return "badge-neutral";
  }
}

export default function AdminEmailEvents({ loaderData }: Route.ComponentProps) {
  if (!loaderData) {
    return null;
  }

  const { emailEvents } = loaderData as { emailEvents: EmailEvent[] };

  return (
    <div className="mx-auto w-full space-y-6">
      <div className="breadcrumbs text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>Email Events</li>
        </ul>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Email Events</h1>
        <p className="text-base-content/70 mt-2">
          Recent application and SES callback email activity.
        </p>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">
            Recent Email Events ({emailEvents.length})
          </h2>

          {emailEvents.length === 0 ? (
            <p className="text-base-content/70">
              No email events have been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-zebra table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Recipient(s)</th>
                    <th>Subject</th>
                    <th>Origin</th>
                    <th>Status</th>
                    <th>Message ID</th>
                  </tr>
                </thead>
                <tbody>
                  {emailEvents.map((event: EmailEvent) => (
                    <tr key={event.message_id}>
                      <td>
                        <div className="text-sm">
                          {formatTimestamp(
                            event.last_event_at ?? event.sent_at,
                          )}
                        </div>
                        <div className="text-base-content/60 text-xs">
                          Sent: {formatTimestamp(event.sent_at)}
                        </div>
                      </td>
                      <td>
                        <div className="max-w-xs text-sm wrap-break-word">
                          {event.to_emails.length > 0
                            ? event.to_emails.join(", ")
                            : "-"}
                        </div>
                      </td>
                      <td>
                        <div className="max-w-xs text-sm wrap-break-word">
                          {event.subject ?? "-"}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-outline">
                          {event.origin}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${statusBadgeClass(event.status)}`}
                        >
                          {event.status}
                        </span>
                      </td>
                      <td>
                        <div className="max-w-xs font-mono text-xs break-all">
                          {event.message_id}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
