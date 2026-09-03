import { CookieJar } from "tough-cookie";
import decodeEmails from "./lib/email-decode";
import { caseless, DEFAULT_HEADERS } from "./lib/caseless";
import { extractSucuriCookie, isAccessDeniedPage, isOrchestrateChallenge, isSucuriRedirect, shouldHandleChallenge } from "./lib/detect";
import { dumpOnSolverFailure } from "./lib/debug-dump";
import { isDebugShimEnabled, log, Logger, setDebugShim } from "./lib/logger";
import { setCookiesOnJar } from "./lib/cookies";
import { isSolverResult, OrchestrateChallengeContext, SolverResult } from "./lib/solver-types";
import { AccessDeniedError, CloudflareError, FlareSolverrError, OrchestrateChallengeError, OrchestrateLoopError, ParserError, RequestError } from "./errors";
import { Requester, TransportRequestOpts } from "./transport";
import { resolveTransport } from "./transports/resolve";

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

const HOST = "__CLOUDSCRAPER_HOST__";

export interface Options {
    uri?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    form?: Record<string, string | number>;
    formData?: Record<string, string | number>;
    qs?: Record<string, string | number | undefined>;
    json?: boolean | object;
    body?: string | Buffer;
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

interface InternalOptions extends Options {
    realEncoding?: string;
    challengesToSolve: number;
    decodeEmails: boolean;
    decompress: boolean;
    followRedirect: boolean;
    cookieJar?: CookieJar;
    headers: Record<string, string>;
    logger?: Logger;
    debugDir?: string;
    proxy?: string;
    impersonate?: string;
}

interface ResponseLike {
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
    body: Buffer | string;
    request?: { uri: { href: string; host: string; hostname: string; protocol: string } };
    responseStartTime?: number;
    isCloudflare?: boolean;
    isHTML?: boolean;
}

function normalizeUrl(opts: Options): string {
    const url = opts.uri ?? opts.url;
    if (typeof url !== "string") {
        throw new TypeError("Expected `uri` or `url` option to be a string");
    }
    const base = opts.prefixUrl ?? opts.baseUrl ?? "";
    return base ? new URL(url, base.endsWith("/") ? base : base + "/").href : url;
}

function normalizeRequestHeaders(headers: Record<string, string>, url: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = value;
    }
    try {
        out.host = new URL(url).host;
    } catch {
        delete out.host;
    }
    return out;
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = value;
    }
    return out;
}

function buildTransportRequest(params: DefaultParams | undefined, opts: InternalOptions): { url: string; transportOpts: TransportRequestOpts } {
    const url = normalizeUrl(opts);
    const headers = normalizeRequestHeaders({ ...opts.headers }, url);
    const timeout = opts.timeout ?? params?.timeout;
    const retry = opts.retry ?? params?.retry;
    const transportOpts: TransportRequestOpts = {
        method: (opts.method as string) ?? "GET",
        headers,
        followRedirect: opts.followRedirect !== false,
        timeout,
        retry,
    };
    if (opts.qs && Object.keys(opts.qs).length > 0) {
        transportOpts.searchParams = opts.qs as Record<string, string>;
    }
    const form = opts.form ?? opts.formData;
    if (form && Object.keys(form).length > 0) {
        transportOpts.form = form as Record<string, string>;
    }
    if (typeof opts.json === "object") {
        transportOpts.json = opts.json;
    }
    if (opts.body != null) {
        transportOpts.body = opts.body;
    }
    return { url, transportOpts };
}

function buildResponse(raw: { url: string; headers: Record<string, string | string[] | undefined>; statusCode: number; body: Buffer }): ResponseLike {
    const requestUrl = new URL(raw.url);
    return {
        headers: raw.headers,
        statusCode: raw.statusCode,
        body: raw.body,
        request: {
            uri: {
                href: requestUrl.href,
                host: requestUrl.host,
                hostname: requestUrl.hostname,
                protocol: requestUrl.protocol,
            },
        },
        responseStartTime: Date.now(),
    };
}

async function performRequest(options: InternalOptions, params: DefaultParams | undefined): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const merged = buildTransportRequest(params, options);
    const cookieJar = options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new CookieJar();
    const transport = await resolveTransport(
        {
            requester: params?.requester,
            impersonate: params?.impersonate ?? options.impersonate,
            proxy: params?.proxy ?? options.proxy,
            timeout: merged.transportOpts.timeout,
            followRedirect: options.followRedirect,
        },
        cookieJar,
    );

    let raw: { url: string; headers: Record<string, string | string[] | undefined>; statusCode: number; body: Buffer };
    try {
        const res = await transport.request(merged.url, merged.transportOpts);
        raw = {
            url: res.url,
            headers: res.headers,
            statusCode: res.status,
            body: res.body,
        };
    } catch (err: unknown) {
        throw new RequestError(err, options, undefined);
    }

    const response = buildResponse(raw);
    response.responseStartTime = Date.now();
    const headersCaseless = caseless(response.headers);
    response.isCloudflare = /^(cloudflare|sucuri|ddos-guard)/i.test(String(headersCaseless.server ?? ""));
    response.isHTML = /text\/html/i.test(String(headersCaseless["content-type"] ?? ""));

    const body: Buffer = response.body as Buffer;
    const stringBody = body.toString("utf8");
    if (shouldHandleChallenge({ headers: response.headers, statusCode: response.statusCode }, stringBody)) {
        return onCloudflareResponse(options, params, response, body);
    }
    return onRequestComplete(options, response, body);
}

function onRequestComplete(options: InternalOptions, response: ResponseLike, body: Buffer | string | unknown): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const encoding = (options.realEncoding ?? "utf8") as BufferEncoding;
    if (typeof encoding === "string" && typeof body !== "string") {
        const str = Buffer.isBuffer(body) ? body.toString(encoding) : String(body);
        if (response.isHTML && options.decodeEmails) {
            response.body = decodeEmails(str);
        } else {
            response.body = str;
        }
        return Promise.resolve({ response, body: response.body as string });
    }
    return Promise.resolve({ response, body: body as Buffer | string });
}

async function onCloudflareResponse(options: InternalOptions, params: DefaultParams | undefined, response: ResponseLike, body: Buffer): Promise<{ response: ResponseLike; body: Buffer | string }> {
    if (body.length < 1) {
        throw new CloudflareError(response.statusCode, options, response);
    }
    const stringBody = body.toString();
    if (isAccessDeniedPage(stringBody)) {
        throw new AccessDeniedError(options, response);
    }
    validateResponse(options, response, stringBody);

    if (isOrchestrateChallenge(response, stringBody)) {
        return onOrchestrateChallenge(options, params, response, stringBody);
    }
    if (isSucuriRedirect(stringBody)) {
        return onRedirectChallenge(options, params, response, stringBody);
    }
    return onRequestComplete(options, response, body);
}

function encodePostData(opts: InternalOptions): string | undefined {
    const form = opts.form ?? opts.formData;
    if (form && Object.keys(form).length > 0) {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(form)) {
            sp.append(k, String(v));
        }
        return sp.toString();
    }
    if (typeof opts.json === "object" && opts.json !== null) {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(opts.json as Record<string, unknown>)) {
            if (v === undefined) continue;
            sp.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
        return sp.toString();
    }
    return undefined;
}

function validateResponse(_options: InternalOptions, response: ResponseLike, body: string): void {
    const match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);
    if (match) {
        throw new CloudflareError(parseInt(match[1], 10), _options, response);
    }
}

async function onOrchestrateChallenge(options: InternalOptions, params: DefaultParams | undefined, response: ResponseLike, body: string): Promise<{ response: ResponseLike; body: Buffer | string }> {
    if (options.challengesToSolve <= 0) {
        throw new OrchestrateLoopError(options, response);
    }
    const url = response.request?.uri?.href ?? normalizeUrl(options);
    const cookieJar = options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new CookieJar();
    const solver = params?.solveOrchestrateChallenge;
    if (typeof solver !== "function") {
        throw new OrchestrateChallengeError(options, response);
    }

    const context: OrchestrateChallengeContext = {
        url,
        response,
        body,
        cookieJar,
        debugDir: options.debugDir ?? params?.debugDir,
        logger: options.logger ?? params?.logger,
        proxy: params?.proxy ?? options.proxy,
        impersonate: params?.impersonate ?? options.impersonate,
        timeout: options.timeout ?? params?.timeout,
        method: String(options.method ?? "GET").toUpperCase(),
        postData: encodePostData(options),
    };
    log(context.logger, "warn", "Cloudflare orchestrate challenge detected. Calling solveOrchestrateChallenge...");

    let result: SolverResult | void;
    try {
        result = await solver(context);
    } catch (err) {
        const extra: Record<string, string | Buffer | undefined> = {};
        if (err instanceof FlareSolverrError && err.screenshot) {
            extra["screenshot.png"] = Buffer.from(err.screenshot, "base64");
        }
        await dumpOnSolverFailure(context, err, extra);
        throw err;
    }

    const newOptions: InternalOptions = {
        ...options,
        cookieJar,
        challengesToSolve: options.challengesToSolve - 1,
        headers: lowercaseHeaders(options.headers),
    };

    if (isSolverResult(result)) {
        newOptions.headers["user-agent"] = result.userAgent;
        if (result.cookies?.length) {
            // A GET solver may return the already-rendered destination body.
            // That response is valid even when Cloudflare did not persist a
            // cf_clearance cookie; follow-up requests still require clearance.
            await setCookiesOnJar(cookieJar, url, result.cookies, {
                requireClearance: !(result.body != null && String(options.method ?? "GET").toUpperCase() === "GET"),
            });
        }
        const method = String(options.method ?? "GET").toUpperCase();
        if (result.body != null && method === "GET") {
            let requestUri = response.request;
            if (result.url) {
                try {
                    const u = new URL(result.url);
                    requestUri = {
                        uri: { href: u.href, host: u.host, hostname: u.hostname, protocol: u.protocol },
                    };
                } catch {
                    /* keep original */
                }
            }
            const synth: ResponseLike = {
                headers: result.headers ?? { "content-type": "text/html" },
                statusCode: result.status ?? 200,
                body: Buffer.from(result.body),
                request: requestUri,
                isHTML: true,
                responseStartTime: Date.now(),
            };
            return onRequestComplete(newOptions, synth, Buffer.from(result.body));
        }
    }

    return performRequest(newOptions, params);
}

async function onRedirectChallenge(options: InternalOptions, params: DefaultParams | undefined, response: ResponseLike, body: string): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const uri = response.request!.uri;
    const cookieStr = extractSucuriCookie(body);
    if (!cookieStr) {
        throw new ParserError("Cookie code extraction failed", options, response);
    }
    const jar = options.cookieJar ?? params?.cookieJar ?? params?.jar;
    if (jar) {
        await jar.setCookie(cookieStr, uri.href, { ignoreError: true });
    }
    const newOptions: InternalOptions = {
        ...options,
        challengesToSolve: options.challengesToSolve - 1,
    };
    return performRequest(newOptions, params);
}

async function request(options?: Options, params?: DefaultParams, retries = 0): Promise<{ body: Buffer | string; [key: string]: unknown }> {
    const defaultParams: DefaultParams = {
        cookieJar: params?.cookieJar ?? params?.jar ?? new CookieJar(),
        headers: params?.headers ?? { ...DEFAULT_HEADERS, Host: HOST },
        followRedirect: params?.followAllRedirects !== false,
        challengesToSolve: params?.challengesToSolve ?? 3,
        decodeEmails: params?.decodeEmails === true,
        decompress: params?.gzip !== false && params?.decompress !== false,
        logger: params?.logger,
        debugDir: params?.debugDir,
        proxy: params?.proxy,
        impersonate: params?.impersonate,
    };
    Object.assign(defaultParams, params);

    const merged: InternalOptions = {
        ...defaultParams,
        ...options,
        realEncoding: (options?.encoding as string) ?? "utf8",
        challengesToSolve: defaultParams.challengesToSolve ?? 3,
        decodeEmails: defaultParams.decodeEmails ?? false,
        decompress: defaultParams.decompress ?? true,
        followRedirect: defaultParams.followRedirect ?? true,
        headers: (options?.headers ?? defaultParams.headers ?? { ...DEFAULT_HEADERS, Host: HOST }) as Record<string, string>,
        logger: defaultParams.logger,
        debugDir: defaultParams.debugDir,
        proxy: defaultParams.proxy,
        impersonate: defaultParams.impersonate,
        timeout: options?.timeout ?? defaultParams.timeout,
        retry: options?.retry ?? defaultParams.retry,
    };

    try {
        const { response, body } = await performRequest(merged, defaultParams);
        if (typeof merged.realEncoding === "string" && response.body !== undefined) {
            return { ...response, body: response.body };
        }
        return { ...response, body };
    } catch (err: unknown) {
        if (err instanceof AccessDeniedError || err instanceof OrchestrateLoopError || err instanceof OrchestrateChallengeError || err instanceof ParserError || err instanceof CloudflareError || err instanceof FlareSolverrError) {
            throw err;
        }
        const errObj = err as { response?: { isCloudflare?: boolean } };
        const res = errObj?.response;
        if (res?.isCloudflare && retries < (params?.challengesToSolve ?? 3)) {
            return request(options, params, retries + 1);
        }
        throw err;
    }
}

Object.defineProperty(request, "debug", {
    configurable: true,
    enumerable: true,
    set(value: boolean) {
        setDebugShim(!!value);
    },
    get() {
        return isDebugShimEnabled();
    },
});

export { AccessDeniedError, CloudflareError, FlareSolverrError, OrchestrateChallengeError, OrchestrateLoopError, ParserError, RequestError, errors } from "./errors";

export default request;
