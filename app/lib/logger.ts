function _log(level: string, message: string, obj?: any) {
  if (import.meta.env?.MODE === "test") {
    return;
  }
  console.log(
    JSON.stringify({
      ...obj,
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
