import { createContext } from "react-router";
import type { User } from "./lib/user-store";
import type { SessionUser } from "./lib/session.server";

export interface Context {
  user: User & SessionUser;
  theme: string;
  locale: string;
  timeZone: string;
}

// React Router's RouterContextProvider.get throws "No value found for context"
// when the context was never set AND its defaultValue is undefined. Use null so
// excluded paths (e.g. /auth/login, where authMiddleware skips context.set) can
// safely call context.get and receive null instead of throwing.
export const appContext = createContext<Context | null>(null);
