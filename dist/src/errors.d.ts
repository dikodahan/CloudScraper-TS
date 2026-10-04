declare class CustomError extends Error {
    errorType: number;
    options?: unknown;
    response?: unknown;
    constructor(cause: unknown, options?: unknown, response?: unknown);
}
export declare class RequestError extends CustomError {
    name: string;
    errorType: number;
    constructor(cause: unknown, options?: unknown, response?: unknown);
}
export declare class CloudflareError extends CustomError {
    name: string;
    errorType: number;
    message: string;
    constructor(cause: unknown, options?: unknown, response?: unknown);
}
export declare class ParserError extends CustomError {
    name: string;
    errorType: number;
    message: string;
    constructor(cause: unknown, options?: unknown, response?: unknown);
}
/**
 * Thrown when Cloudflare returns the newer "Just a moment..." / orchestrate challenge.
 * This challenge requires a real browser (or a clearance service). Provide
 * solveOrchestrateChallenge in defaultParams to handle it (e.g. with patchright).
 */
export declare class OrchestrateChallengeError extends CustomError {
    name: string;
    errorType: number;
    message: string;
    constructor(options?: unknown, response?: unknown);
}
/** Hard Cloudflare/WAF block. Not retryable — do not launch a solver. */
export declare class AccessDeniedError extends CustomError {
    name: string;
    errorType: number;
    constructor(options?: unknown, response?: unknown);
}
/** Orchestrate solver exhausted challengesToSolve without a valid cf_clearance. Not retryable. */
export declare class OrchestrateLoopError extends CustomError {
    name: string;
    errorType: number;
    constructor(options?: unknown, response?: unknown);
}
/** FlareSolverr returned `{ status: "error" }` or was unreachable. Distinct from a missing local browser. */
export declare class FlareSolverrError extends CustomError {
    name: string;
    errorType: number;
    screenshot?: string;
    constructor(cause: unknown, options?: unknown, response?: unknown);
}
export declare const errors: {
    RequestError: typeof RequestError;
    ParserError: typeof ParserError;
    CloudflareError: typeof CloudflareError;
    OrchestrateChallengeError: typeof OrchestrateChallengeError;
    AccessDeniedError: typeof AccessDeniedError;
    OrchestrateLoopError: typeof OrchestrateLoopError;
    FlareSolverrError: typeof FlareSolverrError;
};
export {};
