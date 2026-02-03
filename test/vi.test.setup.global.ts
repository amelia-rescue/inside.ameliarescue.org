// vitest.setup.global.ts
import dynalite, { type DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "~/lib/dynamo-local";

let server: DynaliteServer;

export async function setup() {
  // This runs once before ALL test files
  // throw new Error("nope");
  server = await setupDynamo();
}

export async function teardown() {
  // This runs once after ALL test files are finished
  await teardownDynamo(server);
}
