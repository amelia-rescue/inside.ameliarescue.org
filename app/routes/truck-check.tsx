import { appContext } from "~/context";
import type { Route } from "./+types/truck-check";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import {
  data,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  Link,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiX,
} from "react-icons/fi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import {
  extractIssues,
  getFieldId,
  type PhotoAttachment,
  type ProblemSection,
  type TextNote,
} from "~/lib/truck-check/issues";

type TruckCheckListItem = Awaited<
  ReturnType<TruckCheckStore["listTruckChecks"]>
>["truckChecks"][number];
type Truck = Awaited<ReturnType<TruckCheckSchemaStore["listTrucks"]>>[number];

type TruckCheckWithCompletion = TruckCheckListItem & {
  requiredCompleted: number;
  requiredTotal: number;
  problemCount: number;
  problemTotal: number;
  problemSections: ProblemSection[];
  textNotes: TextNote[];
  photos: PhotoAttachment[];
};

dayjs.extend(utc);
dayjs.extend(timezone);

// Matches the scheduled lock job in server/truck-check-lock.ts.
const LOCK_AFTER_HOURS = 24;
// Trucks not checked for this many days are flagged on their filter chip.
const OVERDUE_DAYS = 7;

function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

async function addCompletionProgress({
  truckChecks,
  trucks,
  truckCheckSchemaStore,
}: {
  truckChecks: TruckCheckListItem[];
  trucks: Truck[];
  truckCheckSchemaStore: TruckCheckSchemaStore;
}): Promise<TruckCheckWithCompletion[]> {
  const schemaCache = new Map<string, TruckCheckSchema>();

  return Promise.all(
    truckChecks.map(async (check) => {
      const truck = trucks.find((t) => t.truckId === check.truck);

      let schemaCacheKey: string | null = null;
      let schemaLookup: (() => Promise<TruckCheckSchema>) | null = null;

      if (check.schema_id && check.schema_created_at) {
        schemaCacheKey = `${check.schema_id}:${check.schema_created_at}`;
        schemaLookup = () =>
          truckCheckSchemaStore.getSchemaVersion(
            check.schema_id as string,
            check.schema_created_at as string,
          );
      } else if (truck) {
        schemaCacheKey = `${truck.schemaId}:latest`;
        schemaLookup = () => truckCheckSchemaStore.getSchema(truck.schemaId);
      }

      if (!schemaCacheKey || !schemaLookup) {
        return {
          ...check,
          requiredCompleted: 0,
          requiredTotal: 0,
          problemCount: 0,
          problemTotal: 0,
          problemSections: [],
          textNotes: [],
          photos: [],
        };
      }

      let schema = schemaCache.get(schemaCacheKey);

      if (!schema) {
        try {
          schema = await schemaLookup();
          schemaCache.set(schemaCacheKey, schema);
        } catch {
          return {
            ...check,
            requiredCompleted: 0,
            requiredTotal: 0,
            problemCount: 0,
            problemTotal: 0,
            problemSections: [],
            textNotes: [],
            photos: [],
          };
        }
      }

      const requiredFieldIds = schema.sections.flatMap((section) =>
        section.fields
          .filter((field) => field.required)
          .map((field) => getFieldId(section.id, field.label)),
      );

      const reportableFieldIds = schema.sections.flatMap((section) =>
        section.fields.flatMap((field) =>
          field.type === "checkbox" ||
          (field.type === "text" && field.reportableIssue)
            ? [getFieldId(section.id, field.label)]
            : [],
        ),
      );

      const { problemSections, textNotes, photos, problemCount } =
        extractIssues({
          data: check.data,
          schema,
          fieldNotes: check.field_notes,
          fieldUpdates: check.field_updates,
        });

      const requiredCompleted = requiredFieldIds.filter((fieldId) =>
        isFieldFilled(check.data[fieldId]),
      ).length;

      return {
        ...check,
        requiredCompleted,
        requiredTotal: requiredFieldIds.length,
        problemCount,
        problemTotal: reportableFieldIds.length,
        problemSections,
        textNotes,
        photos,
      };
    }),
  );
}

// Display fields worked out on the server in the member's time zone, so the
// rendered times match what they see elsewhere (24-hour clock).
function toLogEntries(
  checks: TruckCheckWithCompletion[],
  trucks: Truck[],
  timeZone: string,
  now = new Date(),
) {
  const today = dayjs(now).tz(timeZone).startOf("day");
  return checks.map((check) => {
    const created = dayjs(check.created_at).tz(timeZone);
    const daysAgo = today.diff(created.startOf("day"), "day");
    const date = created.format("ddd, MMM D");
    return {
      ...check,
      truckName:
        trucks.find((t) => t.truckId === check.truck)?.displayName ??
        check.truck,
      time: created.format("HH:mm"),
      dayKey: created.format("YYYY-MM-DD"),
      dayLabel:
        daysAgo === 0
          ? `Today · ${date}`
          : daysAgo === 1
            ? `Yesterday · ${date}`
            : date,
      crew: Object.values(check.contributors)
        .map((c) => `${c.first_name.charAt(0)}. ${c.last_name}`)
        .join(", "),
      locksInHours: check.locked
        ? null
        : Math.max(
            0,
            Math.ceil(
              dayjs(check.created_at)
                .add(LOCK_AFTER_HOURS, "hour")
                .diff(now, "hour", true),
            ),
          ),
    };
  });
}

async function listChecks(
  store: TruckCheckStore,
  truck: string | null,
  lastEvaluatedKey?: Record<string, unknown>,
) {
  return truck
    ? store.listTruckChecksByTruck({ truck, lastEvaluatedKey })
    : store.listTruckChecks(lastEvaluatedKey);
}

export async function action({ context, request }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const intents = ["create", "scroll"];

  const formData = await request.formData();
  const intent = formData.get("intent");
  if (!intents.includes(intent as unknown as string)) {
    throw new Error("invalid intent");
  }

  if (intent === "create") {
    const truck = formData.get("truck");
    if (typeof truck !== "string") {
      throw new Error("truck is not a string");
    }
    const truckCheckStore = TruckCheckStore.make();
    const truckCheckSchemaStore = TruckCheckSchemaStore.make();
    const truckRecord = await truckCheckSchemaStore.getTruck(truck);
    if (truckRecord.retired) {
      return data(
        {
          error:
            "This truck has been retired. New checks cannot be started for it.",
        },
        { status: 400 },
      );
    }
    const schema = await truckCheckSchemaStore.getSchema(truckRecord.schemaId);
    const truckCheck = await truckCheckStore.createTruckCheck({
      created_by: ctx.user.user_id,
      truck: truck,
      data: {},
      contributors: {
        [ctx.user.user_id]: {
          first_name: ctx.user.first_name,
          last_name: ctx.user.last_name,
        },
      },
      locked: false,
      schema_id: schema.schemaId,
      schema_created_at: schema.createdAt,
    });
    return redirect(`/truck-checks/${truckCheck.id}`);
  }

  if (intent === "scroll") {
    const lastEvaluatedKeyJson = formData.get("lastEvaluatedKey");
    const lastEvaluatedKey = lastEvaluatedKeyJson
      ? (JSON.parse(lastEvaluatedKeyJson as string) as Record<string, unknown>)
      : undefined;
    const truckFilter = formData.get("truck");
    const truckCheckStore = TruckCheckStore.make();
    const truckCheckSchemaStore = TruckCheckSchemaStore.make();
    const result = await listChecks(
      truckCheckStore,
      typeof truckFilter === "string" && truckFilter ? truckFilter : null,
      lastEvaluatedKey,
    );
    const trucks = await truckCheckSchemaStore.listTrucks();
    const truckChecksWithCompletion = await addCompletionProgress({
      truckChecks: result.truckChecks,
      trucks,
      truckCheckSchemaStore,
    });

    return {
      truckChecks: toLogEntries(
        truckChecksWithCompletion,
        trucks,
        ctx.timeZone,
      ),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const truckFilter = new URL(request.url).searchParams.get("truck") || null;
  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();

  const trucks = await truckCheckSchemaStore.listTrucks();
  const activeTrucks = trucks
    .filter((truck) => !truck.retired)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const [{ truckChecks: previousChecks, lastEvaluatedKey }, lastChecks] =
    await Promise.all([
      listChecks(truckCheckStore, truckFilter),
      Promise.all(
        activeTrucks.map((truck) =>
          truckCheckStore.listTruckChecksByTruck({
            truck: truck.truckId,
            limit: 1,
          }),
        ),
      ),
    ]);

  // Sort checks by created_at descending (newest first)
  const sortedChecks = [...previousChecks].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const truckChecksWithCompletion = await addCompletionProgress({
    truckChecks: sortedChecks,
    trucks,
    truckCheckSchemaStore,
  });

  const today = dayjs().tz(ctx.timeZone).startOf("day");
  const truckFilters = activeTrucks.map((truck, index) => {
    const last = lastChecks[index].truckChecks[0]?.created_at;
    const daysAgo = last
      ? today.diff(dayjs(last).tz(ctx.timeZone).startOf("day"), "day")
      : null;
    return {
      truckId: truck.truckId,
      displayName: truck.displayName,
      age: daysAgo === null ? null : daysAgo === 0 ? "today" : `${daysAgo}d`,
      overdue: daysAgo === null || daysAgo >= OVERDUE_DAYS,
    };
  });

  return {
    user: ctx.user,
    truckChecks: toLogEntries(truckChecksWithCompletion, trucks, ctx.timeZone),
    trucks,
    truckFilters,
    truckFilter,
    lastEvaluatedKey,
  };
}

type LogEntry = ReturnType<typeof toLogEntries>[number];

export default function TruckCheck() {
  const {
    user,
    truckChecks,
    trucks,
    truckFilters,
    truckFilter,
    lastEvaluatedKey,
  } = useLoaderData<typeof loader>();
  const activeTrucks = trucks.filter((truck) => !truck.retired);
  const selectedTruck = truckFilters.find((t) => t.truckId === truckFilter);
  const navigate = useNavigate();

  const fetcher = useFetcher<typeof action>();
  const modalRef = useRef<HTMLDialogElement>(null);
  const truckCheckFetcher = useFetcher<typeof action>();
  const [allChecks, setAllChecks] = useState<LogEntry[]>(truckChecks);
  const [currentLastKey, setCurrentLastKey] = useState<
    Record<string, unknown> | undefined
  >(lastEvaluatedKey);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // A new truck filter loads a fresh first page.
  useEffect(() => {
    setAllChecks(truckChecks);
    setCurrentLastKey(lastEvaluatedKey);
  }, [truckChecks, lastEvaluatedKey]);

  useEffect(() => {
    const data = truckCheckFetcher.data as
      | { truckChecks: LogEntry[]; lastEvaluatedKey?: Record<string, unknown> }
      | undefined;
    if (!data) return;
    setAllChecks((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newChecks = data.truckChecks.filter((c) => !existingIds.has(c.id));
      return [...prev, ...newChecks].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    });
    setCurrentLastKey(data.lastEvaluatedKey);
  }, [truckCheckFetcher.data]);

  const openChecks = allChecks.filter((check) => !check.locked);
  const history = allChecks.filter(
    (check) => check.locked && (!problemsOnly || check.problemCount > 0),
  );
  const days: { key: string; label: string; checks: LogEntry[] }[] = [];
  for (const check of history) {
    const day = days[days.length - 1];
    if (day?.key === check.dayKey) {
      day.checks.push(check);
    } else {
      days.push({ key: check.dayKey, label: check.dayLabel, checks: [check] });
    }
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-base-content/70">Truck checks</p>
          <h1 className="text-5xl leading-none font-bold sm:text-6xl">
            Check log
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="btn btn-outline border-base-content border-2"
            to="/truck-check/analytics"
          >
            <FiBarChart2 className="h-5 w-5" aria-hidden="true" />
            Analytics
          </Link>
          <button
            className="btn btn-primary"
            onClick={() => modalRef.current?.showModal()}
            disabled={activeTrucks.length === 0}
          >
            Start a check
            <FiChevronRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      <dialog ref={modalRef} id="start-new-check-modal" className="modal">
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <fetcher.Form method="post" className="flex flex-col gap-4">
            <h3 className="section-title">Start a check</h3>
            <p className="text-base-content/70">
              Other members can join and edit the check at the same time. It
              locks automatically after 24 hours.
            </p>
            {fetcher.data && "error" in fetcher.data && (
              <div className="alert alert-error">{fetcher.data.error}</div>
            )}
            <input type="hidden" name="intent" value="create" />
            <label className="flex flex-col gap-1.5">
              <span className="text-base-content/70 text-sm font-semibold">
                Truck
              </span>
              <select
                className="select select-lg w-full"
                required
                name="truck"
                defaultValue={truckFilter ?? undefined}
              >
                {activeTrucks.map((truck) => (
                  <option key={truck.truckId} value={truck.truckId}>
                    {truck.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-action">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={fetcher.state !== "idle"}
              >
                {fetcher.state !== "idle" ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "Start check"
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </dialog>

      {openChecks.length > 0 && (
        <section aria-labelledby="open-now" className="flex flex-col gap-3">
          <h2 id="open-now" className="eyebrow text-base-content/70">
            Open now
          </h2>
          {openChecks.map((check) => (
            <Link
              key={check.id}
              to={`/truck-checks/${check.id}`}
              className="bg-base-100 border-base-content rounded-box flex flex-wrap items-center gap-x-6 gap-y-3 border-2 px-5 py-4"
            >
              <span className="flex min-w-36 flex-col">
                <span className="font-display text-4xl leading-none font-bold">
                  {check.truckName}
                </span>
                <span className="text-base-content/70 text-sm">
                  Started {check.time}
                  {check.locksInHours !== null &&
                    ` · locks in ${check.locksInHours}h`}
                </span>
              </span>
              <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
                <progress
                  className="progress progress-warning h-2.5 w-full"
                  value={check.requiredCompleted}
                  max={check.requiredTotal || 1}
                />
                <span className="text-base-content/70 text-sm">
                  <strong className="text-base-content">
                    {check.requiredCompleted}
                  </strong>{" "}
                  of {check.requiredTotal}
                  {check.crew && ` · ${check.crew}`}
                </span>
              </span>
              <span className="btn btn-primary">
                {check.contributors[user.user_id] ? "Continue" : "Join"}
                <FiChevronRight className="h-5 w-5" />
              </span>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="history" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <h2 id="history" className="section-title mr-auto">
            History
          </h2>
          <label className="flex items-center gap-2">
            <span className="sr-only">Truck</span>
            <select
              className="select border-base-content w-auto min-w-44 border-2 font-semibold"
              value={truckFilter ?? ""}
              onChange={(event) =>
                navigate(
                  event.target.value
                    ? `/truck-check?truck=${encodeURIComponent(event.target.value)}`
                    : "/truck-check",
                  { preventScrollReset: true },
                )
              }
            >
              <option value="">All trucks</option>
              {truckFilters.map((truck) => (
                <option key={truck.truckId} value={truck.truckId}>
                  {truck.displayName}
                </option>
              ))}
            </select>
            {selectedTruck?.overdue && (
              <span className="bg-warning text-warning-content rounded px-1.5 font-mono text-xs">
                {selectedTruck.age ?? "none"}
              </span>
            )}
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={problemsOnly}
              onChange={(event) => setProblemsOnly(event.target.checked)}
            />
            Problems only
          </label>
        </div>

        {days.length === 0 ? (
          <div className="bg-base-100 border-base-300 rounded-box text-base-content/70 border border-dashed p-8 text-center">
            {problemsOnly
              ? "No problems reported on these checks."
              : "No finished checks yet."}
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key} className="flex flex-col gap-2">
              <h3 className="eyebrow text-base-content/70">{day.label}</h3>
              <ul className="bg-base-100 border-base-300 rounded-box overflow-hidden border">
                {day.checks.map((check) => (
                  <LogRow
                    key={check.id}
                    check={check}
                    expanded={expanded.has(check.id)}
                    onToggle={() => toggleExpanded(check.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {currentLastKey ? (
            <button
              className="btn btn-outline border-base-content border-2"
              disabled={truckCheckFetcher.state !== "idle"}
              onClick={() =>
                truckCheckFetcher.submit(
                  {
                    intent: "scroll",
                    lastEvaluatedKey: JSON.stringify(currentLastKey),
                    truck: truckFilter ?? "",
                  },
                  { method: "post" },
                )
              }
              type="button"
            >
              {truckCheckFetcher.state !== "idle"
                ? "Loading…"
                : "Load older checks"}
            </button>
          ) : (
            <span />
          )}
          <a
            className="text-base-content/70 text-sm underline"
            href="/truck-check-legacy"
          >
            Old Google Sheet log
          </a>
        </div>
      </section>
    </div>
  );
}

function LogRow({
  check,
  expanded,
  onToggle,
}: {
  check: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const complete =
    check.requiredTotal > 0 && check.requiredCompleted >= check.requiredTotal;
  const panelId = `problems-${check.id}`;
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <div className="hover:bg-base-200 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link
          to={`/truck-checks/${check.id}`}
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5"
        >
          <span className="flex items-baseline gap-4">
            <span className="text-base-content/70 w-12 shrink-0 font-mono text-sm">
              {check.time}
            </span>
            <span className="font-display text-2xl leading-tight font-bold">
              {check.truckName}
            </span>
          </span>
          {check.crew && (
            <span className="text-base-content/70 pl-16 text-sm">
              {check.crew}
            </span>
          )}
        </Link>
        <span className="flex w-36 flex-col gap-1">
          <progress
            className={`progress h-1.5 w-full ${complete ? "progress-success" : "progress-warning"}`}
            value={check.requiredCompleted}
            max={check.requiredTotal || 1}
          />
          <span className="text-base-content/70 text-xs">
            {check.requiredCompleted} / {check.requiredTotal}
            {!complete && " · not finished"}
          </span>
        </span>
        <span className="ml-auto flex w-36 justify-end">
          {check.problemCount > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={onToggle}
              className="bg-error text-error-content flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-bold"
            >
              <FiAlertTriangle className="h-3.5 w-3.5" />
              {check.problemCount} problem{check.problemCount === 1 ? "" : "s"}
              <FiChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          ) : (
            <span className="text-success flex items-center gap-1.5 text-sm font-semibold">
              <FiCheck className="h-4 w-4" />
              No problems
            </span>
          )}
        </span>
      </div>
      {expanded && (
        <div
          id={panelId}
          className="bg-error/10 mx-4 mb-3 rounded-lg px-4 py-1"
        >
          <ul>
            {check.problemSections.flatMap((section) =>
              section.fields.map((field) => (
                <ProblemItem
                  key={field.fieldId}
                  label={field.label}
                  section={section.sectionTitle}
                  note={field.note}
                  by={field.updatedBy}
                />
              )),
            )}
            {check.textNotes.map((note) => (
              <ProblemItem
                key={note.fieldId}
                label={note.label}
                section={note.sectionTitle}
                note={note.value}
                by={note.updatedBy}
              />
            ))}
          </ul>
          {check.photos.length > 0 && (
            <div className="flex flex-wrap gap-2 py-3">
              {check.photos.flatMap((photo) =>
                photo.urls.map((url, index) => (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${photo.sectionTitle} · ${photo.label}`}
                  >
                    <img
                      src={url}
                      alt={`${photo.label} ${index + 1}`}
                      loading="lazy"
                      className="border-base-300 h-20 w-20 rounded border object-cover"
                    />
                  </a>
                )),
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ProblemItem({
  label,
  section,
  note,
  by,
}: {
  label: string;
  section: string;
  note?: string;
  by?: { first_name: string; last_name: string };
}) {
  return (
    <li className="border-base-300 flex gap-3 border-b py-2.5 last:border-b-0">
      <span className="bg-error text-error-content mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded">
        <FiX className="h-3.5 w-3.5" strokeWidth={4} />
      </span>
      <span className="min-w-0">
        <span className="font-semibold">{label}</span>{" "}
        <span className="text-base-content/70">· {section}</span>
        {note && (
          <span className="block break-words whitespace-pre-wrap">{note}</span>
        )}
        {by && (
          <span className="text-base-content/70 block text-sm">
            Reported by {by.first_name} {by.last_name}
          </span>
        )}
      </span>
    </li>
  );
}
