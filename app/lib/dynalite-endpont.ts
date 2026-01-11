// pro tip: you absolutely cannot import a module that imports dynalite in lambda
export const DYNALITE_ENDPOINT = "http://localhost:10420" as const;
export type DynaliteEndpoint = typeof DYNALITE_ENDPOINT;
