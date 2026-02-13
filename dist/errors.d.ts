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
export declare class CaptchaError extends CustomError {
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
 * solveOrchestrateChallenge in defaultParams to handle it (e.g. with Puppeteer/Playwright).
 */
export declare class OrchestrateChallengeError extends CustomError {
    name: string;
    errorType: number;
    message: string;
    constructor(options?: unknown, response?: unknown);
}
/** For compatibility with code that expected request-promise-core StatusCodeError */
export declare class StatusCodeError extends CustomError {
    name: string;
    errorType: number;
}
/** For compatibility with code that expected request-promise-core TransformError */
export declare class TransformError extends CustomError {
    name: string;
    errorType: number;
}
export declare const errors: {
    RequestError: typeof RequestError;
    CaptchaError: typeof CaptchaError;
    ParserError: typeof ParserError;
    CloudflareError: typeof CloudflareError;
    OrchestrateChallengeError: typeof OrchestrateChallengeError;
    StatusCodeError: typeof StatusCodeError;
    TransformError: typeof TransformError;
};
export {};
