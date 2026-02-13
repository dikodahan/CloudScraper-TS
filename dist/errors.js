"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.errors = exports.TransformError = exports.StatusCodeError = exports.OrchestrateChallengeError = exports.ParserError = exports.CloudflareError = exports.CaptchaError = exports.RequestError = void 0;
const os = __importStar(require("os"));
const http = __importStar(require("http"));
const EOL = os.EOL;
const ERROR_CODES = {
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
function format(lines) {
    return EOL + lines.join(EOL) + EOL + EOL;
}
const BUG_REPORT = format([
    "### Cloudflare may have changed their technique, or there may be a bug.",
    "### Bug Reports: https://github.com/codemanki/cloudscraper/issues",
    "### Check the detailed exception message that follows for the cause.",
]);
class CustomError extends Error {
    errorType;
    options;
    response;
    constructor(cause, options, response) {
        const message = cause instanceof Error ? cause.message : String(cause);
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
class RequestError extends CustomError {
    name = "RequestError";
    errorType = 0;
    constructor(cause, options, response) {
        super(cause, options, response);
        this.name = "RequestError";
    }
}
exports.RequestError = RequestError;
class CaptchaError extends CustomError {
    name = "CaptchaError";
    errorType = 1;
    constructor(cause, options, response) {
        super(cause, options, response);
        this.name = "CaptchaError";
    }
}
exports.CaptchaError = CaptchaError;
class CloudflareError extends CustomError {
    name = "CloudflareError";
    errorType = 2;
    message;
    constructor(cause, options, response) {
        super(cause, options, response);
        this.name = "CloudflareError";
        this.message = "";
        if (typeof cause === "number" && !isNaN(cause)) {
            const description = ERROR_CODES[cause] || http.STATUS_CODES[cause];
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
exports.CloudflareError = CloudflareError;
class ParserError extends CustomError {
    name = "ParserError";
    errorType = 3;
    message = "";
    constructor(cause, options, response) {
        super(cause, options, response);
        this.name = "ParserError";
        this.message = BUG_REPORT + (cause instanceof Error ? cause.message : String(cause));
    }
}
exports.ParserError = ParserError;
/**
 * Thrown when Cloudflare returns the newer "Just a moment..." / orchestrate challenge.
 * This challenge requires a real browser (or a clearance service). Provide
 * solveOrchestrateChallenge in defaultParams to handle it (e.g. with Puppeteer/Playwright).
 */
class OrchestrateChallengeError extends CustomError {
    name = "OrchestrateChallengeError";
    errorType = 7;
    message;
    constructor(options, response) {
        super("Cloudflare orchestrate challenge (Just a moment...). " +
            "This challenge requires a browser. Pass solveOrchestrateChallenge in defaultParams, " +
            "e.g. using Puppeteer/Playwright to open the URL and capture cookies.", options, response);
        this.name = "OrchestrateChallengeError";
        this.message =
            "Cloudflare orchestrate challenge (Just a moment...). " +
                "Provide solveOrchestrateChallenge in defaultParams to solve it (e.g. with Puppeteer/Playwright).";
    }
}
exports.OrchestrateChallengeError = OrchestrateChallengeError;
/** For compatibility with code that expected request-promise-core StatusCodeError */
class StatusCodeError extends CustomError {
    name = "StatusCodeError";
    errorType = 5;
}
exports.StatusCodeError = StatusCodeError;
/** For compatibility with code that expected request-promise-core TransformError */
class TransformError extends CustomError {
    name = "TransformError";
    errorType = 6;
}
exports.TransformError = TransformError;
exports.errors = {
    RequestError,
    CaptchaError,
    ParserError,
    CloudflareError,
    OrchestrateChallengeError,
    StatusCodeError,
    TransformError,
};
