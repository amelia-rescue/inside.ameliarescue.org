import { appContext } from "~/context";
import type { Route } from "./+types/truck-check";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import {
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
} from "react-router";
import { useRef } from "react";
import { IoWarning } from "react-icons/io5";
import {
  TruckCheckSchemaStore,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";

export async function action({ context, request }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const thing = await request.formData();
  const truck = thing.get("truck");
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
    contributors: [ctx.user.user_id],
    locked: false,
    schema_id: schema.schemaId,
    schema_created_at: schema.createdAt,
  });
  return redirect(`/truck-checks/${truckCheck.id}`);
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();

  const previousChecks = await truckCheckStore.listTruckChecks();
  const trucks = await truckCheckSchemaStore.listTrucks();

  // Sort checks by created_at descending (newest first)
  const sortedChecks = [...previousChecks].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { user: ctx.user, previousChecks: sortedChecks, trucks };
}

export default function TruckCheck() {
  const { user, previousChecks, trucks } = useLoaderData<typeof loader>();
  const stuff = useActionData<typeof action>();

  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Truck Checks</h1>
          <p className="mt-2 opacity-70">
            Collaborative truck inspection checklists
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a className="btn btn-ghost btn-sm" href="/truck-check-legacy">
            Legacy Google Sheet
          </a>
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
          <fetcher.Form method="post" ref={formRef}>
            <h3 className="text-lg font-bold">New Truck Check!</h3>
            <p className="py-4">
              Once you create a new check other members will be able to edit it
              simultaneously.
            </p>
            <div className="alert alert-warning">
              <IoWarning />
              Truck checks are automatically locked after 24 hours.
            </div>
            <select className="select mt-4" required name="truck">
              {trucks.map((truck) => (
                <option key={truck.truckId} value={truck.truckId}>
                  {truck.displayName}
                </option>
              ))}
            </select>
            <div className="modal-action">
              <button
                onClick={() => fetcher.submit(formRef.current)}
                className="btn btn-primary"
              >
                Start New Check
              </button>
            </div>
          </fetcher.Form>
        </div>
      </dialog>
      <div className="space-y-4">
        {previousChecks.length === 0 ? (
          <div className="card bg-base-200">
            <div className="card-body text-center">
              <p className="opacity-60">
                No truck checks yet. Start your first check!
              </p>
            </div>
          </div>
        ) : (
          previousChecks.map((check) => {
            const truck = trucks.find((t) => t.truckId === check.truck);
            const checkDate = new Date(check.created_at);
            const isRecent =
              Date.now() - checkDate.getTime() < 24 * 60 * 60 * 1000;

            return (
              <div key={check.id} className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="card-title">
                        {truck?.displayName || check.truck}
                      </h2>
                      <p className="mt-1 text-sm opacity-70">
                        {checkDate.toLocaleDateString()} at{" "}
                        {checkDate.toLocaleTimeString()}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        {check.locked && (
                          <span className="badge badge-error">Locked</span>
                        )}
                        <span className="text-sm opacity-60">
                          {check.contributors.length} contributor
                          {check.contributors.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
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
      </div>
    </div>
  );
}
