import { createContext } from "react-router";
import type { User } from "./lib/user-store";

export interface Context {
  user: User;
  theme: string;
}

export const appContext = createContext<Context | undefined>(undefined);
