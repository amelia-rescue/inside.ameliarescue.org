export interface LogContext {
  requestId: string;
  xrayTraceId?: string;
}

type LogContextProvider = () => LogContext | undefined;
type GlobalWithLogContext = typeof globalThis & {
  __insideAmeliaRescueLogContextProvider?: LogContextProvider;
};

const globalWithLogContext = globalThis as GlobalWithLogContext;

export function setLogContextProvider(provider: LogContextProvider): void {
  globalWithLogContext.__insideAmeliaRescueLogContextProvider = provider;
}

function getLogContext() {
  return globalWithLogContext.__insideAmeliaRescueLogContextProvider?.();
}

function _log(level: string, message: string, obj?: any) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  console.log(
    JSON.stringify({
      ...obj,
      ...getLogContext(),
      level,
      log_message: message,
    }),
  );
}

export const log = {
  info: (message: string, obj?: any) => {
    _log("info", message, obj);
  },
  warn: (message: string, obj?: any) => {
    _log("warn", message, obj);
  },
  error: (message: string, obj?: any) => {
    _log("error", message, obj);
  },
};
