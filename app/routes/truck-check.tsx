import { appContext } from "~/context";
import type { Route } from "./+types/truck-check";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { redirect, useFetcher, useLoaderData, Link } from "react-router";
import { useEffect, useRef, useState } from "react";
import { IoWarning } from "react-icons/io5";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import { DateDisplay } from "~/components/date-display";

type TruckCheckListItem = Awaited<
  ReturnType<TruckCheckStore["listTruckChecks"]>
>["truckChecks"][number];
type Truck = Awaited<ReturnType<TruckCheckSchemaStore["listTrucks"]>>[number];

type ProblemField = {
  fieldId: string;
  label: string;
};

type ProblemSection = {
  sectionTitle: string;
  fields: ProblemField[];
};

type TruckCheckWithCompletion = TruckCheckListItem & {
  requiredCompleted: number;
  requiredTotal: number;
  problemCount: number;
  problemTotal: number;
  problemSections: ProblemSection[];
};

function getFieldId(sectionId: string, fieldLabel: string): string {
  return `${sectionId}-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

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
          };
        }
      }

      const requiredFieldIds = schema.sections.flatMap((section) =>
        section.fields
          .filter((field) => field.required)
          .map((field) => getFieldId(section.id, field.label)),
      );

      const checkboxFieldIds = schema.sections.flatMap((section) =>
        section.fields.flatMap((field) =>
          field.type === "checkbox"
            ? [getFieldId(section.id, field.label)]
            : [],
        ),
      );

      const problemSections: ProblemSection[] = [];
      for (const section of schema.sections) {
        const problemFields: ProblemField[] = [];
        for (const field of section.fields) {
          if (field.type !== "checkbox") continue;
          const fieldId = getFieldId(section.id, field.label);
          if (check.data[fieldId] === "not-present") {
            problemFields.push({ fieldId, label: field.label });
          }
        }
        if (problemFields.length > 0) {
          problemSections.push({
            sectionTitle: section.title,
            fields: problemFields,
          });
        }
      }

      const requiredCompleted = requiredFieldIds.filter((fieldId) =>
        isFieldFilled(check.data[fieldId]),
      ).length;

      const problemCount = problemSections.reduce(
        (sum, section) => sum + section.fields.length,
        0,
      );

      return {
        ...check,
        requiredCompleted,
        requiredTotal: requiredFieldIds.length,
        problemCount,
        problemTotal: checkboxFieldIds.length,
        problemSections,
      };
    }),
  );
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
    const truckCheckStore = TruckCheckStore.make();
    const truckCheckSchemaStore = TruckCheckSchemaStore.make();
    const result = await truckCheckStore.listTruckChecks(lastEvaluatedKey);
    const trucks = await truckCheckSchemaStore.listTrucks();
    const truckChecksWithCompletion = await addCompletionProgress({
      truckChecks: result.truckChecks,
      trucks,
      truckCheckSchemaStore,
    });

    return {
      truckChecks: truckChecksWithCompletion,
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();

  const { truckChecks: previousChecks, lastEvaluatedKey } =
    await truckCheckStore.listTruckChecks();
  const trucks = await truckCheckSchemaStore.listTrucks();

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

  return {
    user: ctx.user,
    truckChecks: truckChecksWithCompletion,
    trucks,
    lastEvaluatedKey,
  };
}

export default function TruckCheck() {
  const { truckChecks, trucks, lastEvaluatedKey } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher();
  const modalRef = useRef<HTMLDialogElement>(null);

  const toggleModal = () => {
    if (modalRef.current) {
      if (modalRef.current.open) {
        modalRef.current.close();
      } else {
        modalRef.current.showModal();
      }
    }
  };

  const truckCheckFetcher = useFetcher<typeof action>();
  const [allChecks, setAllChecks] = useState(truckChecks);
  const [currentLastKey, setCurrentLastKey] = useState<
    Record<string, unknown> | undefined
  >(lastEvaluatedKey);
  const [selectedCheck, setSelectedCheck] =
    useState<TruckCheckWithCompletion | null>(null);
  const problemModalRef = useRef<HTMLDialogElement>(null);

  const openProblemModal = (check: TruckCheckWithCompletion) => {
    setSelectedCheck(check);
    problemModalRef.current?.showModal();
  };

  useEffect(() => {
    const data = truckCheckFetcher.data as
      | {
          truckChecks: typeof truckChecks;
          lastEvaluatedKey?: Record<string, unknown>;
        }
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>Truck Checks</li>
        </ul>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Truck Checks</h1>
          <p className="mt-2 opacity-70">
            Collaborative truck inspection checklists
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a className="btn btn-ghost btn-sm" href="/truck-check-legacy">
            Legacy Google Sheet
          </a>
          <Link className="btn btn-secondary" to="/truck-check/analytics">
            Analytics
          </Link>
          <button className="btn btn-primary" onClick={toggleModal}>
            Start New Check
          </button>
        </div>
      </div>
      <dialog ref={modalRef} id="start-new-check-modal" className="modal">
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <fetcher.Form method="post">
            <h3 className="text-lg font-bold">New Truck Check!</h3>
            <p className="py-4">
              Once you create a new check other members will be able to edit it
              simultaneously.
            </p>
            <div className="alert alert-warning">
              <IoWarning />
              Truck checks are automatically locked after 24 hours.
            </div>
            <input type="hidden" name="intent" value="create" />
            <select className="select mt-4" required name="truck">
              {trucks.map((truck) => (
                <option key={truck.truckId} value={truck.truckId}>
                  {truck.displayName}
                </option>
              ))}
            </select>
            <div className="modal-action">
              <button
                type="submit"
                className={`btn ${fetcher.state !== "idle" ? "btn-disabled" : "btn-primary"}`}
                disabled={fetcher.state !== "idle"}
              >
                {fetcher.state !== "idle" ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "Start New Check"
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </dialog>
      <div className="space-y-4">
        {allChecks.length === 0 ? (
          <div className="card border-base-300 bg-base-100 border border-dashed">
            <div className="card-body items-center py-12 text-center">
              <div className="mb-2 text-4xl opacity-40">✓</div>
              <h2 className="text-lg font-semibold">No truck checks yet</h2>
              <p className="max-w-sm text-sm opacity-60">
                Start your first check to begin tracking truck readiness.
              </p>
            </div>
          </div>
        ) : (
          allChecks.map((check) => {
            const truck = trucks.find((t) => t.truckId === check.truck);
            const checkDate = new Date(check.created_at);
            const isRecent =
              Date.now() - checkDate.getTime() < 24 * 60 * 60 * 1000;
            const contributorNames = Object.values(check.contributors).map(
              (contributor) =>
                `${contributor.first_name} ${contributor.last_name}`.trim(),
            );
            const isComplete =
              check.requiredTotal > 0 &&
              check.requiredCompleted === check.requiredTotal;

            return (
              <article
                key={check.id}
                className="rounded-box border-base-300 bg-base-100 overflow-hidden border shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-lg font-bold sm:text-xl">
                        {truck?.displayName || check.truck}
                      </h2>
                      {isRecent && (
                        <span className="badge badge-info badge-sm">
                          Recent
                        </span>
                      )}
                      {check.locked && (
                        <span className="badge badge-error badge-sm">
                          Locked
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm opacity-60">
                      <DateDisplay
                        value={check.created_at}
                        format="shortDate"
                      />{" "}
                      at{" "}
                      <DateDisplay
                        value={check.created_at}
                        format="shortTime"
                      />
                      <span className="mx-2">·</span>
                      <span className="font-mono text-xs">
                        #{check.id.slice(0, 8)}
                      </span>
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${isComplete ? "bg-success" : "bg-warning"}`}
                        />
                        <span>
                          <span className="font-semibold">
                            {check.requiredCompleted}/{check.requiredTotal}
                          </span>{" "}
                          complete
                        </span>
                      </div>
                      <div className="max-w-full min-w-0 truncate opacity-70">
                        {contributorNames.length > 0
                          ? contributorNames.join(", ")
                          : "No contributors"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row lg:w-44 lg:flex-col">
                    {check.problemCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-error btn-sm sm:flex-1"
                        onClick={() => openProblemModal(check)}
                      >
                        {check.problemCount} problem
                        {check.problemCount === 1 ? "" : "s"} found
                      </button>
                    )}
                    <a
                      href={`/truck-checks/${check.id}`}
                      className={`btn btn-sm sm:flex-1 ${check.locked ? "btn-outline" : "btn-primary"}`}
                    >
                      {check.locked ? "View check" : "Edit check"}
                    </a>
                  </div>
                </div>
              </article>
            );
          })
        )}

        {currentLastKey && (
          <div className="flex justify-center pt-2">
            <button
              className={`btn ${truckCheckFetcher.state !== "idle" ? "btn-disabled" : "btn-outline"}`}
              disabled={truckCheckFetcher.state !== "idle"}
              onClick={() => {
                if (!currentLastKey || truckCheckFetcher.state !== "idle") {
                  return;
                }

                truckCheckFetcher.submit(
                  {
                    intent: "scroll",
                    lastEvaluatedKey: JSON.stringify(currentLastKey),
                  },
                  { method: "post" },
                );
              }}
              type="button"
            >
              {truckCheckFetcher.state !== "idle"
                ? "Loading..."
                : "Load more checks"}
            </button>
          </div>
        )}
      </div>

      <dialog
        ref={problemModalRef}
        id="problem-detail-modal"
        className="modal"
        onClose={() => setSelectedCheck(null)}
      >
        <div className="modal-box max-w-3xl">
          <form method="dialog">
            <button
              type="submit"
              className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
            >
              ✕
            </button>
          </form>
          {selectedCheck && (
            <>
              <h3 className="text-lg font-bold">
                {trucks.find((t) => t.truckId === selectedCheck.truck)
                  ?.displayName || selectedCheck.truck}{" "}
                Problems
              </h3>
              <p className="py-2 text-sm opacity-60">
                <DateDisplay
                  value={selectedCheck.created_at}
                  format="shortDate"
                />{" "}
                at{" "}
                <DateDisplay
                  value={selectedCheck.created_at}
                  format="shortTime"
                />{" "}
                · {selectedCheck.problemCount} problem
                {selectedCheck.problemCount === 1 ? "" : "s"} found
              </p>
              <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {selectedCheck.problemSections.map((section) => (
                  <div key={section.sectionTitle} className="card bg-base-200">
                    <div className="card-body py-4">
                      <h4 className="card-title text-base">
                        {section.sectionTitle}
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {section.fields.map((field) => (
                          <li
                            key={field.fieldId}
                            className="flex items-start gap-3"
                          >
                            <span className="border-error bg-error text-error-content flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 text-sm font-bold">
                              ✕
                            </span>
                            <span className="pt-0.5">{field.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
