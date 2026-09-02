export type LogLevel = "debug" | "info" | "warn" | "error";
export type Logger = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => void;

let shimLogger: Logger | undefined;

export function setDebugShim(enabled: boolean): void {
    shimLogger = enabled
        ? (level, msg, meta) => {
              const line = meta ? msg + " " + JSON.stringify(meta) : msg;
              if (level === "error") console.error(line);
              else console.warn(line);
          }
        : undefined;
}

export function isDebugShimEnabled(): boolean {
    return !!shimLogger;
}

export function log(logger: Logger | undefined, level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    const fn = logger ?? shimLogger;
    if (fn) fn(level, msg, meta);
}
