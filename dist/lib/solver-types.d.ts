import { CookieJar } from "tough-cookie";
import { Logger } from "./logger";
export interface CookieForJar {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    expiry?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
}
export interface SolverResult {
    cookies: CookieForJar[];
    /** Required — cf_clearance is bound to this User-Agent. */
    userAgent: string;
    body?: string;
    status?: number;
    headers?: Record<string, string>;
    url?: string;
    turnstileToken?: string;
}
export interface OrchestrateChallengeContext {
    url: string;
    response: {
        headers: Record<string, string | string[] | undefined>;
        statusCode: number;
        body?: Buffer | string;
    };
    body: string;
    cookieJar: CookieJar;
    debugDir?: string;
    logger?: Logger;
    proxy?: string;
    impersonate?: string;
    timeout?: number;
    method?: string;
    postData?: string;
}
/** Custom solvers may still return void for one minor version (cookie-jar mutation only). */
export type OrchestrateSolverFn = (context: OrchestrateChallengeContext) => Promise<SolverResult | void>;
export interface SolverOptions {
    headless?: boolean;
    timeout?: number;
    debugDir?: string;
    logger?: Logger;
    proxy?: string;
    impersonate?: string;
    /** Tab presses before Space on the Turnstile widget. 0 disables. Default 1. */
    tabsTillVerify?: number;
    /** Block images/CSS/fonts/media during the solve. Default true. */
    disableMedia?: boolean;
    /** Recycle the pooled browser context until this age (ms). Default 5 minutes. */
    sessionTtlMs?: number;
    /** Max concurrent browser solves. Default 2. */
    concurrency?: number;
    /** FlareSolverr session id. `false` skips sessions (cold start each solve). Default `"cloudscraper-ts"`. */
    session?: string | false;
    /** FlareSolverr `session_ttl_minutes`. Defaults from `sessionTtlMs` (5 minutes). */
    sessionTtlMinutes?: number;
    /** Override FlareSolverr `maxTimeout` (ms). Defaults to `timeout` or 60000. */
    maxTimeout?: number;
    /** FlareSolverr `returnOnlyCookies` — skip HTML when only clearance is needed. Default true for non-GET. */
    returnOnlyCookies?: boolean;
    /** Seconds to wait after the challenge clears before reading cookies/HTML. */
    waitInSeconds?: number;
}
export declare function isSolverResult(value: SolverResult | void): value is SolverResult;
