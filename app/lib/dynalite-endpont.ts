// pro tip: you absolutely cannot import a module that imports dynalite in lambda

// Each vitest worker gets its own dynalite instance on its own port so test
// files can run in parallel without colliding. VITEST_POOL_ID is 1-based and
// unique per concurrently running worker.
export const DYNALITE_PORT = 10420 + Number(process.env.VITEST_POOL_ID ?? 0);
export const DYNALITE_ENDPOINT = `http://localhost:${DYNALITE_PORT}`;
export type DynaliteEndpoint = typeof DYNALITE_ENDPOINT;
