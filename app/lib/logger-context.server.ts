import { AsyncLocalStorage } from "node:async_hooks";
import { setLogContextProvider, type LogContext } from "~/lib/logger";

const logContext = new AsyncLocalStorage<LogContext>();

setLogContextProvider(() => logContext.getStore());

export function getXrayTraceId(traceHeader = process.env._X_AMZN_TRACE_ID) {
  return traceHeader
    ?.split(";")
    .find((part) => part.startsWith("Root="))
    ?.slice("Root=".length);
}

export function runWithLogContext<T>(
  context: LogContext,
  callback: () => T,
): T {
  return logContext.run(context, callback);
}
