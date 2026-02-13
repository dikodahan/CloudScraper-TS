import { CookieJar } from "tough-cookie";
/** Got is ESM-only; we load it at runtime to keep this package CommonJS. */
type GotInstance = (urlOrOptions: string | GotRequestOptions) => Promise<GotResponse>;
interface GotRequestOptions {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    cookieJar?: CookieJar;
    followRedirect?: boolean;
    decompress?: boolean;
    responseType?: string;
    throwHttpErrors?: boolean;
    https?: {
        ciphers?: string;
    };
    searchParams?: Record<string, string>;
    form?: Record<string, string>;
    json?: unknown;
}
interface GotResponse {
    url: string;
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
    body: Buffer | string;
}
/** Context passed to solveOrchestrateChallenge when the "Just a moment..." page is encountered. */
export interface OrchestrateChallengeContext {
    /** URL that returned the challenge (visit this in a browser to obtain cookies). */
    url: string;
    /** Response headers and status. */
    response: ResponseLike;
    /** Raw HTML body of the challenge page. */
    body: string;
    /** Cookie jar to set cf_clearance (and other cookies) on; then the library will retry. */
    cookieJar: CookieJar;
}
/** Request options compatible with the previous request-based API */
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
    [key: string]: unknown;
}
export interface DefaultParams {
    requester?: GotInstance;
    jar?: CookieJar;
    cookieJar?: CookieJar;
    headers?: Record<string, string>;
    cloudflareMaxTimeout?: number;
    followAllRedirects?: boolean;
    followRedirect?: boolean;
    challengesToSolve?: number;
    decodeEmails?: boolean;
    gzip?: boolean;
    decompress?: boolean;
    agentOptions?: {
        ciphers?: string;
    };
    https?: {
        ciphers?: string;
    };
    /**
     * When Cloudflare returns the "Just a moment..." (orchestrate) challenge, call this with the
     * challenge URL and cookie jar. Use a headless browser (e.g. Puppeteer/Playwright) to open
     * the URL, let the challenge complete, then set the resulting cookies on cookieJar.
     * The library will then retry the original request with the new cookies.
     */
    solveOrchestrateChallenge?: (context: OrchestrateChallengeContext) => Promise<void>;
}
interface ResponseLike {
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
    body: Buffer | string;
    request?: {
        uri: {
            href: string;
            host: string;
            hostname: string;
            protocol: string;
        };
    };
    responseStartTime?: number;
    isCloudflare?: boolean;
    isHTML?: boolean;
    isCaptcha?: boolean;
    challenge?: string;
}
declare function request(options?: Options, params?: DefaultParams, retries?: number): Promise<{
    body: Buffer | string;
    [key: string]: unknown;
}>;
export { OrchestrateChallengeError } from "./errors";
type OrchestrateSolverFn = (context: OrchestrateChallengeContext) => Promise<void>;
/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using a FlareSolverr instance.
 * Set env FLARESOLVERR_URL (e.g. http://localhost:8191/v1) to use FlareSolverr; the default
 * solver will try this first when the variable is set.
 */
export declare function createFlareSolverrOrchestrateSolver(baseUrl: string): OrchestrateSolverFn;
export declare function createPuppeteerOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn;
/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using Playwright.
 * Optional: install playwright to use. Lighter than Puppeteer when using playwright-core
 * with a system browser. The browser will open the challenge URL and cookies are written to the jar.
 */
export declare function createPlaywrightOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn;
/**
 * Returns a solver that tries, in order: FlareSolverr (if FLARESOLVERR_URL is set),
 * then Puppeteer, then Playwright. Puppeteer and Playwright are optional; install one
 * if you don't use FlareSolverr. If none are available, the solver throws when used.
 */
export declare function createDefaultOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn;
export default request;
