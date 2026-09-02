export type LogLevel = "debug" | "info" | "warn" | "error";
export type Logger = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => void;
export declare function setDebugShim(enabled: boolean): void;
export declare function isDebugShimEnabled(): boolean;
export declare function log(logger: Logger | undefined, level: LogLevel, msg: string, meta?: Record<string, unknown>): void;
