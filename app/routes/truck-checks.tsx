import { appContext } from "~/context";
import type { Route } from "./+types/truck-checks";
import { TruckCheckStore } from "~/lib/truck-check-store";
import { useFetcher, useLoaderData } from "react-router";
import { useRef } from "react";
import { IoWarning } from "react-icons/io5";

export async function action({ context }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }
  const truckCheckStore = TruckCheckStore.make();
  await truckCheckStore.createTruckCheck({
    created_by: ctx.user.user_id,
    truck: "",
    data: {},
    contributors: [ctx.user.user_id],
    locked: false,
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const truckCheckStore = TruckCheckStore.make();

  const previousChecks = await truckCheckStore.listTruckChecks();

  return { user: ctx.user, previousChecks };
}

export default function TruckChecks() {
  const { user, previousChecks } = useLoaderData<typeof loader>();
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

  const handleStartNewCheck = () => {
    // TODO: Implement start new check logic
    console.log("Starting new check...");
  };

  return (
    <div>
      <h1>Truck Checks</h1>
      <button className="btn btn-primary" onClick={toggleModal}>
        Start New Check
      </button>
      <dialog ref={modalRef} id="start-new-check-modal" className="modal">
        <div className="modal-box">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <h3 className="text-lg font-bold">New Truck Check!</h3>
          <p className="py-4">
            Once you create a new check other members will be able to edit it
            simultaneously.
          </p>
          <div className="alert alert-warning">
            <IoWarning />
            Truck checks are automatically locked after 24 hours.
          </div>
          <div className="modal-action">
            <button className="btn btn-primary">Start New Check</button>
          </div>
        </div>
      </dialog>
      <div>
        {previousChecks.map((check) => (
          <div key={check.id}>
            <h2>{check.truck}</h2>
            <p>{check.created_at}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
