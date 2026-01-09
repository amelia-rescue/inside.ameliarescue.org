declare module "dynalite" {
  export interface DynaliteServer {
    listen(
      port: number,
      hostnameOrCallback?: string | ((err?: unknown) => void),
      callback?: (err?: unknown) => void,
    ): void;

    close(callback?: (err?: unknown) => void): void;
  }

  export interface DynaliteOptions {
    createTableMs?: number;
    deleteTableMs?: number;
    updateTableMs?: number;
    path?: string;
    ssl?: boolean;
  }

  export default function dynalite(options?: DynaliteOptions): DynaliteServer;
}
