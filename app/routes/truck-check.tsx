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
          <div className="card bg-base-200">
            <div className="card-body text-center">
              <p className="opacity-60">
                No truck checks yet. Start your first check!
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

            return (
              <div key={check.id} className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="card-title break-words">
                        {truck?.displayName || check.truck}
                      </h2>
                      <p className="mt-1 text-sm opacity-70">
                        <DateDisplay
                          value={check.created_at}
                          format="shortDate"
                        />{" "}
                        at{" "}
                        <DateDisplay
                          value={check.created_at}
                          format="shortTime"
                        />
                      </p>
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        {check.locked && (
                          <span className="badge badge-error">Locked</span>
                        )}
                        <span
                          className={`badge badge-sm ${
                            check.requiredTotal > 0 &&
                            check.requiredCompleted === check.requiredTotal
                              ? "badge-success"
                              : "badge-outline"
                          }`}
                        >
                          {check.requiredCompleted}/{check.requiredTotal}
                        </span>
                        {check.problemCount > 0 && (
                          <button
                            type="button"
                            className="btn btn-error btn-sm"
                            onClick={() => openProblemModal(check)}
                          >
                            {check.problemCount} problem
                            {check.problemCount === 1 ? "" : "s"}
                          </button>
                        )}
                      </div>
                      <div className="mt-1 text-sm break-words opacity-60">
                        {contributorNames.length > 0
                          ? contributorNames.join(", ")
                          : "No contributors"}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-sm opacity-60">
                        Check #{check.id.slice(0, 8)}
                      </span>
                      <div className="flex gap-2">
                        <a
                          href={`/truck-checks/${check.id}`}
                          className={`btn btn-sm ${check.locked ? "btn-outline" : "btn-primary"}`}
                        >
                          {check.locked ? "View" : "Edit"}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {currentLastKey && (
          <div className="flex justify-center">
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
              {truckCheckFetcher.state !== "idle" ? "Loading..." : "Load More"}
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
