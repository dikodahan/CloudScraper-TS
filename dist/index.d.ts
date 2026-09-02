import { CookieJar } from "tough-cookie";
import { Logger } from "./lib/logger";
import { OrchestrateChallengeContext, SolverResult } from "./lib/solver-types";
import { Requester } from "./transport";
export type { Logger } from "./lib/logger";
export type { CookieForJar, OrchestrateChallengeContext, OrchestrateSolverFn, SolverOptions, SolverResult } from "./lib/solver-types";
export type { Requester, Transport, TransportRequestOpts, TransportResponse } from "./transport";
export { isAccessDeniedPage, isOrchestrateChallenge, isSucuriRedirect, extractSucuriCookie, shouldHandleChallenge } from "./lib/detect";
export { setCookiesOnJar } from "./lib/cookies";
export { createPatchrightOrchestrateSolver, createPlaywrightOrchestrateSolver } from "./solvers/chromium";
export { createBrowserlessOrchestrateSolver, createPuppeteerOrchestrateSolver } from "./solvers/puppeteer";
export { createFlareSolverrOrchestrateSolver, destroyFlareSolverrSession } from "./solvers/flaresolverr";
export { createDefaultOrchestrateSolver } from "./solvers/default";
export { closeBrowserPool } from "./browser-pool";
export interface Options {
    uri?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    form?: Record<string, string | number>;
    formData?: Record<string, string | number>;
    qs?: Record<string, string | number | undefined>;
    json?: boolean | object;
    encoding?: string | null;
    baseUrl?: string;
    prefixUrl?: string;
    timeout?: number;
    retry?: number;
    [key: string]: unknown;
}
export interface DefaultParams {
    requester?: Requester;
    jar?: CookieJar;
    cookieJar?: CookieJar;
    headers?: Record<string, string>;
    followAllRedirects?: boolean;
    followRedirect?: boolean;
    challengesToSolve?: number;
    decodeEmails?: boolean;
    gzip?: boolean;
    decompress?: boolean;
    timeout?: number;
    retry?: number;
    logger?: Logger;
    debugDir?: string;
    /** Proxy URL for the HTTP transport and browser solvers (http, https, socks4, socks5). */
    proxy?: string;
    /** impit browser profile, e.g. "chrome" or "chrome151". */
    impersonate?: string;
    /**
     * When Cloudflare returns the "Just a moment..." (orchestrate) challenge, call this with the
     * challenge URL and cookie jar. Prefer returning SolverResult (cookies + userAgent + optional body).
     * A void return is still accepted: mutate cookieJar and the library will retry.
     */
    solveOrchestrateChallenge?: (context: OrchestrateChallengeContext) => Promise<SolverResult | void>;
}
declare function request(options?: Options, params?: DefaultParams, retries?: number): Promise<{
    body: Buffer | string;
    [key: string]: unknown;
}>;
export { AccessDeniedError, CloudflareError, FlareSolverrError, OrchestrateChallengeError, OrchestrateLoopError, ParserError, RequestError, errors } from "./errors";
export default request;
