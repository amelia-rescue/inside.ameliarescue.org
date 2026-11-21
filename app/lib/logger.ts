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

/**
 * Error's name, message, and stack are non-enumerable, so JSON.stringify
 * turns an Error into `{}`. Copy them (plus any enumerable extras such as
 * an AWS SDK error's `$metadata`) into a plain object. `cause` and
 * AggregateError `errors` are left as Errors; the replacer below handles
 * them recursively.
 */
function serializeError(error: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...error,
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause !== undefined) {
    serialized.cause = error.cause;
  }
  if (error instanceof AggregateError) {
    serialized.errors = error.errors;
  }
  return serialized;
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

export function formatLogLine(
  level: string,
  message: string,
  obj?: any,
): string {
  const entry = {
    ...obj,
    ...getLogContext(),
    level,
    log_message: message,
  };
  try {
    return JSON.stringify(entry, replacer);
  } catch (stringifyError) {
    // e.g. a circular reference; still emit the message so it isn't lost.
    return JSON.stringify({
      ...getLogContext(),
      level,
      log_message: message,
      log_serialization_error: String(stringifyError),
    });
  }
}

function _log(level: string, message: string, obj?: any) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  console.log(formatLogLine(level, message, obj));
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
