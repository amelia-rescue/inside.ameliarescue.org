import { createContext } from "react-router";
import type { User } from "./lib/user-store";

export interface Context {
  user: User;
}

export const appContext = createContext<Context | undefined>(undefined);
