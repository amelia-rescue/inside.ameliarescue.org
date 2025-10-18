import { createContext } from "react-router";

export interface Context {
  x: string;
}

export const appContext = createContext<Context | undefined>(undefined);
