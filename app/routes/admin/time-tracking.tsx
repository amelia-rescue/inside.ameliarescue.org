import { data, Link, redirect, useFetcher } from "react-router";
import { useEffect, useState, type FormEvent } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { IoLocationSharp, IoTime, IoWarning } from "react-icons/io5";
import type { Route } from "./+types/time-tracking";
import { appContext } from "~/context";
import { requireAdmin } from "~/lib/authorize.server";
import { hasAdminAccess } from "~/lib/website-role";
import { DateDisplay } from "~/components/date-display";
import { UserStore } from "~/lib/user-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { TimeEntryError, TimeEntryStore } from "~/lib/time-entry-store";
import {
  TIME_ENTRY_TYPES,
  TIME_ENTRY_TYPE_LABELS,
  hoursBetween,
  isTimeEntryType,
  normalizeLocation,
  type TimeEntry,
  type TimeEntryLocation,
} from "~/lib/time-entry";
import {
  MONTHLY_DUTY_HOURS_TARGET,
  summarizeByMember,
} from "~/lib/time-entry-summary";

dayjs.extend(utc);
dayjs.extend(timezone);

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Time Tracking - Admin - Amelia Rescue" },
    { name: "description", content: "Prototype duty hours clock in and out" },
  ];
}

export const handle = {
  breadcrumb: "Time Tracking",
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function loader({ context, request }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx?.user || !hasAdminAccess(ctx.user.website_role)) {
    throw redirect("/");
  }

  const timeZone = ctx.timeZone || "America/New_York";
  const requestedMonth = new URL(request.url).searchParams.get("month");
  const currentMonth = dayjs().tz(timeZone).format("YYYY-MM");
  const month =
    requestedMonth && MONTH_PATTERN.test(requestedMonth)
      ? requestedMonth
      : currentMonth;
  const monthStart = dayjs.tz(`${month}-01`, timeZone).startOf("month");
  const monthEnd = monthStart.add(1, "month");

  const store = TimeEntryStore.make();
  const [myEntries, monthEntries, users, trucks] = await Promise.all([
    store.listForUser(ctx.user.user_id, 10),
    store.listBetween(
      monthStart.toDate().toISOString(),
      monthEnd.toDate().toISOString(),
    ),
    UserStore.make().listUsers(true),
    TruckCheckSchemaStore.make().listTrucks(),
  ]);

  const names: Record<string, string> = {};
  for (const u of users) {
    names[u.user_id] = `${u.first_name} ${u.last_name}`;
  }

  const openEntry = myEntries[0]?.status === "open" ? myEntries[0] : null;

  return {
    timeZone,
    month,
    currentMonth,
    prevMonth: monthStart.subtract(1, "month").format("YYYY-MM"),
    nextMonth: monthEnd.format("YYYY-MM"),
    monthLabel: monthStart.format("MMMM YYYY"),
    openEntry,
    myEntries: myEntries.filter((e) => e.status === "closed"),
    monthEntries: [...monthEntries].reverse(),
    summaries: summarizeByMember(monthEntries).sort((a, b) =>
      (names[a.user_id] ?? "").localeCompare(names[b.user_id] ?? ""),
    ),
    names,
    trucks: trucks
      .map((t) => ({ id: t.truckId, name: t.displayName }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      ),
  };
}

function locationFrom(formData: FormData): TimeEntryLocation {
  return normalizeLocation({
    status: formData.get("location_status"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    accuracy_m: formData.get("accuracy_m"),
  });
}

export async function action({ context, request }: Route.ActionArgs) {
  // Prototype: admin-only until it is rolled out to everyone.
  const ctx = requireAdmin(context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const store = TimeEntryStore.make();
  const userId = ctx.user.user_id;

  try {
    if (intent === "clock_in") {
      const entryType = formData.get("entry_type");
      if (!isTimeEntryType(entryType)) {
        return data({ error: "Pick what this time is for." }, { status: 400 });
      }
      const unit = String(formData.get("unit") ?? "").slice(0, 64);
      await store.clockIn({
        userId,
        entryType,
        unit,
        location: locationFrom(formData),
      });
      return { ok: true as const };
    }

    if (intent === "clock_out") {
      const entryType = formData.get("entry_type");
      if (!isTimeEntryType(entryType)) {
        return data({ error: "Pick what this time was for." }, { status: 400 });
      }
      const callsRaw = String(formData.get("calls_run") ?? "").trim();
      const callsRun = callsRaw === "" ? NaN : Number(callsRaw);
      if (!Number.isInteger(callsRun) || callsRun < 0 || callsRun > 99) {
        return data(
          { error: "Enter how many calls you ran (0 if none)." },
          { status: 400 },
        );
      }
      await store.clockOut({
        userId,
        entryType,
        callsRun,
        notes: String(formData.get("notes") ?? ""),
        location: locationFrom(formData),
      });
      return { ok: true as const };
    }

    if (intent === "cancel") {
      await store.cancelOpenEntry(userId);
      return { ok: true as const };
    }
  } catch (error) {
    if (error instanceof TimeEntryError) {
      return data({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

type LocationFields = Record<string, string>;

/** Asks the browser for an approximate position; never rejects. */
function getApproximateLocation(): Promise<LocationFields> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve({ location_status: "unavailable" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          location_status: "ok",
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          accuracy_m: String(position.coords.accuracy),
        }),
      (error) =>
        resolve({
          location_status:
            error.code === error.PERMISSION_DENIED
              ? "denied"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Submits the form through the fetcher after attaching the browser location,
 * so every clock in/out records where it happened (or why it couldn't).
 */
function useLocatedSubmit() {
  const fetcher = useFetcher<typeof action>();
  const [locating, setLocating] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    if (formData.get("intent") !== "cancel") {
      setLocating(true);
      const location = await getApproximateLocation();
      setLocating(false);
      for (const [key, value] of Object.entries(location)) {
        formData.set(key, value);
      }
    }
    fetcher.submit(formData, { method: "post" });
  }

  const busy = locating || fetcher.state !== "idle";
  const error =
    fetcher.state === "idle" && fetcher.data && "error" in fetcher.data
      ? fetcher.data.error
      : null;
  return { onSubmit, busy, locating, error };
}

function useElapsedHours(startIso: string) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(id);
  }, []);
  return hoursBetween(startIso, now);
}

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function LocationCell({ location }: { location?: TimeEntryLocation }) {
  if (!location) return <span className="text-base-content/40">—</span>;
  if (location.status !== "ok") {
    return (
      <span className="badge badge-ghost badge-sm" title="No location recorded">
        {location.status === "denied"
          ? "Denied"
          : location.status === "timeout"
            ? "Timed out"
            : "Unavailable"}
      </span>
    );
  }
  return (
    <a
      className="link link-primary inline-flex items-center gap-1 text-xs whitespace-nowrap"
      href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
      target="_blank"
      rel="noreferrer"
    >
      <IoLocationSharp className="h-3.5 w-3.5" />
      Map
      {location.accuracy_m !== undefined && (
        <span className="text-base-content/50">±{location.accuracy_m} m</span>
      )}
    </a>
  );
}

function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="alert alert-error mb-4 text-sm">
      <IoWarning className="h-5 w-5" />
      <span>{message}</span>
    </div>
  );
}

function ClockInCard({ trucks }: { trucks: { id: string; name: string }[] }) {
  const { onSubmit, busy, locating, error } = useLocatedSubmit();
  return (
    <form onSubmit={onSubmit} className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">You're clocked out</h2>
        <ErrorAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-control w-full">
            <span className="label-text mb-1">What is this time for?</span>
            <select
              name="entry_type"
              className="select select-bordered w-full"
              defaultValue="duty"
              required
            >
              {TIME_ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TIME_ENTRY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1">Ambulance</span>
            <select
              name="unit"
              className="select select-bordered w-full"
              defaultValue=""
            >
              <option value="">None / not on a truck</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-base-content/60 text-xs">
          Your browser will ask to share your approximate location when you
          clock in and out.
        </p>
        <div className="card-actions justify-end">
          <button
            type="submit"
            name="intent"
            value="clock_in"
            className="btn btn-primary btn-lg w-full sm:w-auto"
            disabled={busy}
          >
            {busy && <span className="loading loading-spinner loading-sm" />}
            {locating ? "Getting location…" : "Clock in"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ClockOutCard({
  entry,
  truckName,
}: {
  entry: TimeEntry;
  truckName?: string;
}) {
  const { onSubmit, busy, locating, error } = useLocatedSubmit();
  const elapsed = useElapsedHours(entry.clock_in_at);
  return (
    <form
      onSubmit={onSubmit}
      className="card bg-base-100 border-success border-2 shadow-xl"
    >
      <div className="card-body">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="card-title">You're clocked in</h2>
            <p className="text-base-content/70 text-sm">
              Since{" "}
              <DateDisplay value={entry.clock_in_at} format="ddd M/D HH:mm" />
              {truckName ? ` · ${truckName}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold">
              {formatHours(elapsed)}
            </div>
            <div className="text-base-content/50 text-xs">elapsed</div>
          </div>
        </div>
        <ErrorAlert message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-control w-full">
            <span className="label-text mb-1">What was this time for?</span>
            <select
              name="entry_type"
              className="select select-bordered w-full"
              defaultValue={entry.entry_type}
              required
            >
              {TIME_ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TIME_ENTRY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-1"># Calls run</span>
            <input
              type="number"
              name="calls_run"
              min={0}
              max={99}
              step={1}
              inputMode="numeric"
              className="input input-bordered w-full"
              placeholder="0"
              required
            />
          </label>
          <label className="form-control w-full sm:col-span-2">
            <span className="label-text mb-1">Notes (optional)</span>
            <input
              type="text"
              name="notes"
              maxLength={500}
              className="input input-bordered w-full"
            />
          </label>
        </div>
        <div className="card-actions justify-between">
          <button
            type="submit"
            name="intent"
            value="cancel"
            formNoValidate
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={(e) => {
              if (
                !confirm("Throw away this clock-in? No hours will be saved.")
              ) {
                e.preventDefault();
              }
            }}
          >
            Cancel clock-in
          </button>
          <button
            type="submit"
            name="intent"
            value="clock_out"
            className="btn btn-success btn-lg w-full sm:w-auto"
            disabled={busy}
          >
            {busy && <span className="loading loading-spinner loading-sm" />}
            {locating ? "Getting location…" : "Clock out"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function TimeTracking({ loaderData }: Route.ComponentProps) {
  const {
    openEntry,
    myEntries,
    monthEntries,
    summaries,
    names,
    trucks,
    month,
    currentMonth,
    prevMonth,
    nextMonth,
    monthLabel,
  } = loaderData;
  const truckNames = Object.fromEntries(trucks.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">Time Tracking</h1>
          <span className="badge badge-warning">Prototype · admins only</span>
        </div>
        <p className="text-base-content/70 mt-2 max-w-2xl">
          Replaces the paper duty hours log. Clock in and out times and
          locations are recorded automatically; the type and number of calls are
          self-reported.
        </p>
      </div>

      {openEntry ? (
        <ClockOutCard
          entry={openEntry}
          truckName={openEntry.unit ? truckNames[openEntry.unit] : undefined}
        />
      ) : (
        <ClockInCard trucks={trucks} />
      )}

      {myEntries.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Your recent entries</h2>
          <div className="space-y-2 sm:hidden">
            {myEntries.map((e) => (
              <div
                key={e.entry_id}
                className="rounded-box border-base-300 bg-base-100 border p-3 text-sm"
              >
                <div className="flex justify-between font-medium">
                  <span>{TIME_ENTRY_TYPE_LABELS[e.entry_type]}</span>
                  <span>{formatHours(e.total_hours ?? 0)}</span>
                </div>
                <div className="text-base-content/60">
                  <DateDisplay value={e.clock_in_at} format="M/D HH:mm" /> –{" "}
                  <DateDisplay value={e.clock_out_at} format="HH:mm" /> ·{" "}
                  {e.calls_run ?? 0} calls
                  {e.unit ? ` · ${truckNames[e.unit] ?? e.unit}` : ""}
                </div>
              </div>
            ))}
          </div>
          <EntriesTable
            className="hidden sm:block"
            entries={myEntries}
            names={names}
            truckNames={truckNames}
            showName={false}
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Everyone · {monthLabel}</h2>
          <div className="join">
            <Link to={`?month=${prevMonth}`} className="btn btn-sm join-item">
              ‹ Prev
            </Link>
            {month !== currentMonth && (
              <Link to="?" className="btn btn-sm join-item">
                This month
              </Link>
            )}
            <Link to={`?month=${nextMonth}`} className="btn btn-sm join-item">
              Next ›
            </Link>
          </div>
        </div>

        {summaries.length === 0 ? (
          <p className="text-base-content/60 text-sm">
            No time recorded this month.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-zebra table-sm table">
                <thead>
                  <tr>
                    <th>Member</th>
                    {TIME_ENTRY_TYPES.map((t) => (
                      <th key={t} className="text-right">
                        {TIME_ENTRY_TYPE_LABELS[t]}
                      </th>
                    ))}
                    <th className="text-right">Total hrs</th>
                    <th className="text-right">Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.user_id}>
                      <td className="whitespace-nowrap">
                        {names[s.user_id] ?? "Unknown member"}
                        {s.open_entries > 0 && (
                          <span className="badge badge-success badge-xs ml-2">
                            on now
                          </span>
                        )}
                      </td>
                      {TIME_ENTRY_TYPES.map((t) => (
                        <td key={t} className="text-right font-mono">
                          {t === "duty" ? (
                            <span
                              className={
                                s.meets_duty_target
                                  ? "text-success font-semibold"
                                  : ""
                              }
                            >
                              {s.hours_by_type[t].toFixed(2)}
                            </span>
                          ) : (
                            s.hours_by_type[t].toFixed(2)
                          )}
                        </td>
                      ))}
                      <td className="text-right font-mono font-semibold">
                        {s.total_hours.toFixed(2)}
                      </td>
                      <td className="text-right font-mono">{s.calls_run}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-base-content/60 mt-2 text-xs">
              Duty hours in green meet the SOP minimum of{" "}
              {MONTHLY_DUTY_HOURS_TARGET} duty/standby hours a month.
            </p>

            <h3 className="mt-6 mb-2 font-semibold">All entries</h3>
            <EntriesTable
              entries={monthEntries}
              names={names}
              truckNames={truckNames}
              showName
            />
          </>
        )}
      </section>
    </div>
  );
}

function EntriesTable({
  entries,
  names,
  truckNames,
  showName,
  className = "",
}: {
  entries: TimeEntry[];
  names: Record<string, string>;
  truckNames: Record<string, string>;
  showName: boolean;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="table-zebra table-sm table">
        <thead>
          <tr>
            {showName && <th>Name</th>}
            <th>Ambulance</th>
            <th>Date</th>
            <th>In</th>
            <th>Out</th>
            <th className="text-right">Hours</th>
            <th className="text-right">Calls</th>
            <th>Type</th>
            <th>In location</th>
            <th>Out location</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.user_id}/${e.entry_id}`}>
              {showName && (
                <td className="whitespace-nowrap">
                  {names[e.user_id] ?? "Unknown member"}
                </td>
              )}
              <td className="whitespace-nowrap">
                {e.unit ? (truckNames[e.unit] ?? e.unit) : "—"}
              </td>
              <td className="whitespace-nowrap">
                <DateDisplay value={e.clock_in_at} format="M/D/YY" />
              </td>
              <td className="font-mono">
                <DateDisplay value={e.clock_in_at} format="HHmm" />
              </td>
              <td className="font-mono">
                {e.status === "open" ? (
                  <span className="badge badge-success badge-sm">
                    <IoTime className="mr-1 h-3 w-3" />
                    on now
                  </span>
                ) : (
                  <DateDisplay value={e.clock_out_at} format="HHmm" />
                )}
              </td>
              <td className="text-right font-mono">
                {e.total_hours?.toFixed(2) ?? "—"}
              </td>
              <td className="text-right font-mono">{e.calls_run ?? "—"}</td>
              <td className="whitespace-nowrap">
                {TIME_ENTRY_TYPE_LABELS[e.entry_type]}
                {e.notes && (
                  <div
                    className="text-base-content/60 max-w-48 truncate text-xs"
                    title={e.notes}
                  >
                    {e.notes}
                  </div>
                )}
              </td>
              <td>
                <LocationCell location={e.clock_in_location} />
              </td>
              <td>
                <LocationCell location={e.clock_out_location} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
