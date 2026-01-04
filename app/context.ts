import { createContext } from "react-router";
import type { SessionUser } from "./lib/session.server";

export interface Context {
  user: SessionUser;
}

export const appContext = createContext<Context | undefined>(undefined);
