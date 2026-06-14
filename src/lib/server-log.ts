type LogContext = Record<string, string | number | boolean | null | undefined>;

function cleanContext(context: LogContext = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  );
}

export function logServerInfo(message: string, context?: LogContext) {
  console.info(`[server] ${message}`, cleanContext(context));
}

export function logServerAuthInfo(message: string, context?: LogContext) {
  if (process.env.DEBUG_AUTH !== "1") {
    return;
  }

  logServerInfo(message, context);
}

export function logServerWarn(message: string, context?: LogContext) {
  console.warn(`[server] ${message}`, cleanContext(context));
}

export function logServerError(message: string, context?: LogContext) {
  console.error(`[server] ${message}`, cleanContext(context));
}
