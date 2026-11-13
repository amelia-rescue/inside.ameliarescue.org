import { afterEach, beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "~/lib/dynamo-local";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import TruckCheck, { action, loader, shouldRevalidate } from "./truck-check";

let dynamo: DynaliteServer;

const context = {
  get: () => ({
    user: {
      user_id: "user-1",
      first_name: "Test",
      last_name: "User",
      website_role: "user",
    },
    timeZone: "UTC",
  }),
} as any;

beforeEach(async () => {
  dynamo = await setupDynamo();
});

afterEach(async () => {
  await teardownDynamo(dynamo);
});

function renderedCheckIds() {
  return new Set(
    screen
      .queryAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/truck-checks/")),
  );
}

// Waits until the button is idle again, not still showing "Loading…".
function loadOlderButton() {
  return screen.findByRole(
    "button",
    { name: "Load older checks" },
    { timeout: 5000 },
  );
}

it("keeps every loaded page when loading older checks repeatedly", async () => {
  const schemas = TruckCheckSchemaStore.make();
  const checks = TruckCheckStore.make();
  const schema = await schemas.createSchema({
    created_by: "user-1",
    version: 1,
    title: "Checklist",
    sections: [
      {
        id: "equipment",
        title: "Equipment",
        fields: [{ type: "checkbox", label: "Oxygen", required: true }],
      },
    ],
  });
  await schemas.createTruck({
    truckId: "medic-1",
    displayName: "Medic 1",
    schemaId: schema.schemaId,
  });

  // Three pages: 100 + 100 + 50.
  const total = 250;
  for (let i = 0; i < total; i++) {
    await checks.createTruckCheck({
      created_by: "user-1",
      truck: "medic-1",
      data: {},
      contributors: {},
      locked: true,
      schema_id: schema.schemaId,
      schema_created_at: schema.createdAt,
    });
  }

  const Stub = createRoutesStub([
    {
      path: "/truck-check",
      Component: TruckCheck as any,
      loader: (args: any) => loader({ ...args, context }),
      action: (args: any) => action({ ...args, context }),
      shouldRevalidate,
    },
  ]);
  render(<Stub initialEntries={["/truck-check"]} />);

  await waitFor(() => expect(renderedCheckIds().size).toBe(100));

  fireEvent.click(await loadOlderButton());
  await waitFor(() => expect(renderedCheckIds().size).toBe(200));

  fireEvent.click(await loadOlderButton());
  await waitFor(() => expect(renderedCheckIds().size).toBe(total));

  expect(
    screen.queryByRole("button", { name: "Load older checks" }),
  ).not.toBeInTheDocument();
}, 30_000);
