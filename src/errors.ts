import * as os from "os";
import * as http from "http";

const EOL = os.EOL;

interface CloudflareErrorCodes {
    [key: number]: string;
}

const ERROR_CODES: CloudflareErrorCodes = {
    520: "Web server is returning an unknown error",
    521: "Web server is down",
    522: "Connection timed out",
    523: "Origin is unreachable",
    524: "A timeout occurred",
    525: "SSL handshake failed",
    526: "Invalid SSL certificate",
    527: "Railgun Listener to Origin Error",
    530: "Origin DNS error",
    1000: "DNS points to prohibited IP",
    1001: "DNS resolution error",
    1002: "Restricted or DNS points to Prohibited IP",
    1003: "Access Denied: Direct IP Access Not Allowed",
    1004: "Host Not Configured to Serve Web Traffic",
    1005: "Access Denied: IP of banned ASN/ISP",
    1010: "The owner of this website has banned your access based on your browser's signature",
    1011: "Access Denied (Hotlinking Denied)",
    1012: "Access Denied",
    1013: "HTTP hostname and TLS SNI hostname mismatch",
    1016: "Origin DNS error",
    1018: "Domain is misconfigured",
    1020: "Access Denied (Custom Firewall Rules)",
};

ERROR_CODES[1006] = ERROR_CODES[1007] = ERROR_CODES[1008] =
    "Access Denied: Your IP address has been banned";

function format(lines: string[]): string {
    return EOL + lines.join(EOL) + EOL + EOL;
}

const BUG_REPORT = format([
    "### Cloudflare may have changed their technique, or there may be a bug.",
    "### Bug Reports: https://github.com/codemanki/cloudscraper/issues",
    "### Check the detailed exception message that follows for the cause.",
]);

class CustomError extends Error {
    errorType: number;
    options?: unknown;
    response?: unknown;

    constructor(cause: unknown, options?: unknown, response?: unknown) {
        const message =
            cause instanceof Error ? cause.message : String(cause);
        super(message);
        this.name = "RequestError";
        this.errorType = 0;
        this.options = options;
        this.response = response;
        if (cause instanceof Error && cause.stack) {
            this.cause = cause;
        }
    }
}

export class RequestError extends CustomError {
    override name = "RequestError";
    override errorType = 0;

    constructor(cause: unknown, options?: unknown, response?: unknown) {
        super(cause, options, response);
        this.name = "RequestError";
    }
}

export class CaptchaError extends CustomError {
    override name = "CaptchaError";
    override errorType = 1;

    constructor(cause: unknown, options?: unknown, response?: unknown) {
        super(cause, options, response);
        this.name = "CaptchaError";
    }
}

export class CloudflareError extends CustomError {
    override name = "CloudflareError";
    override errorType = 2;
    override message: string;

    constructor(cause: unknown, options?: unknown, response?: unknown) {
        super(cause, options, response);
        this.name = "CloudflareError";
        this.message = "";
        if (typeof cause === "number" && !isNaN(cause)) {
            const description =
                ERROR_CODES[cause] || http.STATUS_CODES[cause];
            if (description) {
                this.message = cause + ", " + description;
            }
        }
        if (!this.message && cause instanceof Error) {
            this.message = cause.message;
        }
        if (!this.message) {
            this.message = String(cause);
        }
    }
}

export class ParserError extends CustomError {
    override name = "ParserError";
    override errorType = 3;
    override message = "";

    constructor(cause: unknown, options?: unknown, response?: unknown) {
        super(cause, options, response);
        this.name = "ParserError";
        this.message = BUG_REPORT + (cause instanceof Error ? cause.message : String(cause));
    }
}

/**
 * Thrown when Cloudflare returns the newer "Just a moment..." / orchestrate challenge.
 * This challenge requires a real browser (or a clearance service). Provide
 * solveOrchestrateChallenge in defaultParams to handle it (e.g. with Puppeteer/Playwright).
 */
export class OrchestrateChallengeError extends CustomError {
    override name = "OrchestrateChallengeError";
    override errorType = 7;
    override message: string;

    constructor(options?: unknown, response?: unknown) {
        super(
            "Cloudflare orchestrate challenge (Just a moment...). " +
                "This challenge requires a browser. Pass solveOrchestrateChallenge in defaultParams, " +
                "e.g. using Puppeteer/Playwright to open the URL and capture cookies.",
            options,
            response,
        );
        this.name = "OrchestrateChallengeError";
        this.message =
            "Cloudflare orchestrate challenge (Just a moment...). " +
            "Provide solveOrchestrateChallenge in defaultParams to solve it (e.g. with Puppeteer/Playwright).";
    }
}

/** For compatibility with code that expected request-promise-core StatusCodeError */
export class StatusCodeError extends CustomError {
    override name = "StatusCodeError";
    override errorType = 5;
}

/** For compatibility with code that expected request-promise-core TransformError */
export class TransformError extends CustomError {
    override name = "TransformError";
    override errorType = 6;
}

export const errors = {
    RequestError,
    CaptchaError,
    ParserError,
    CloudflareError,
    OrchestrateChallengeError,
    StatusCodeError,
    TransformError,
};
