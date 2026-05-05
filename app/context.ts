import { createContext } from "react-router";
import type { User } from "./lib/user-store";
import type { SessionUser } from "./lib/session.server";

export interface Context {
  user: User & SessionUser;
  theme: string;
  locale: string;
  timeZone: string;
}

export const appContext = createContext<Context | undefined>(undefined);
