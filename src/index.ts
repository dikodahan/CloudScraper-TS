import { CookieJar } from "tough-cookie";
import crypto from "crypto";
import { deprecate } from "util";

/** Got is ESM-only; we load it at runtime to keep this package CommonJS. */
type GotInstance = (urlOrOptions: string | GotRequestOptions) => Promise<GotResponse>;
let gotPromise: Promise<GotInstance> | null = null;
async function loadGot(): Promise<GotInstance> {
    if (!gotPromise) {
        gotPromise = import("got").then((m) => (m.default as GotInstance));
    }
    return gotPromise;
}

interface GotRequestOptions {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    cookieJar?: CookieJar;
    followRedirect?: boolean;
    decompress?: boolean;
    responseType?: string;
    throwHttpErrors?: boolean;
    https?: { ciphers?: string };
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

import { evaluate, Context } from "./lib/sandbox";
import decodeEmails from "./lib/email-decode";
import { getDefaultHeaders, caseless } from "./lib/headers";
import brotli from "./lib/brotli";
import {
    CaptchaError,
    CloudflareError,
    OrchestrateChallengeError,
    ParserError,
    RequestError,
} from "./errors";

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

let debugging = false;
const HOST = "__CLOUDSCRAPER_HOST__";

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
    agentOptions?: { ciphers?: string };
    https?: { ciphers?: string };
    /**
     * When Cloudflare returns the "Just a moment..." (orchestrate) challenge, call this with the
     * challenge URL and cookie jar. Use a headless browser (e.g. Puppeteer/Playwright) to open
     * the URL, let the challenge complete, then set the resulting cookies on cookieJar.
     * The library will then retry the original request with the new cookies.
     */
    solveOrchestrateChallenge?: (context: OrchestrateChallengeContext) => Promise<void>;
}

interface InternalOptions extends Options {
    realEncoding?: string;
    challengesToSolve: number;
    cloudflareMaxTimeout: number;
    decodeEmails: boolean;
    decompress: boolean;
    followRedirect: boolean;
    cookieJar?: CookieJar;
    headers: Record<string, string>;
    https?: { ciphers: string };
}

interface ResponseLike {
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
    body: Buffer | string;
    request?: { uri: { href: string; host: string; hostname: string; protocol: string } };
    responseStartTime?: number;
    isCloudflare?: boolean;
    isHTML?: boolean;
    isCaptcha?: boolean;
    challenge?: string;
}

function normalizeUrl(opts: Options): string {
    const url = opts.uri ?? opts.url;
    if (typeof url !== "string") {
        throw new TypeError("Expected `uri` or `url` option to be a string");
    }
    const base = opts.prefixUrl ?? opts.baseUrl ?? "";
    return base ? new URL(url, base.endsWith("/") ? base : base + "/").href : url;
}

function buildGotOptions(
    params: DefaultParams | undefined,
    opts: InternalOptions,
): GotRequestOptions & { url: string } {
    const url = normalizeUrl(opts);
    const cookieJar = opts.cookieJar ?? params?.cookieJar ?? params?.jar ?? new CookieJar();
    const headers = { ...opts.headers };
    if (headers.Host === HOST) {
        try {
            const u = new URL(url);
            headers.host = u.host;
        } catch {
            delete headers.Host;
        }
    }

    const gotOpts: GotRequestOptions & { url: string } = {
        url,
        method: (opts.method as "GET" | "POST" | "HEAD" | "PUT" | "DELETE") ?? "GET",
        headers,
        cookieJar,
        followRedirect: opts.followRedirect !== false,
        decompress: opts.decompress !== false,
        responseType: "buffer",
        throwHttpErrors: false,
        https: opts.https ?? (params?.agentOptions?.ciphers
            ? { ciphers: params.agentOptions.ciphers }
            : {
                  ciphers:
                      crypto.constants.defaultCipherList +
                      ":!ECDHE+SHA:!AES128-SHA",
              }),
    };

    if (opts.qs && Object.keys(opts.qs).length > 0) {
        gotOpts.searchParams = opts.qs as Record<string, string>;
    }
    const form = opts.form ?? opts.formData;
    if (form && Object.keys(form).length > 0) {
        gotOpts.form = form as Record<string, string>;
    }
    if (opts.json === true) {
        gotOpts.responseType = "buffer";
    }
    if (typeof opts.json === "object") {
        gotOpts.json = opts.json;
        gotOpts.responseType = "buffer";
    }

    return gotOpts;
}

function buildResponse(gotResponse: { url: string; headers: Record<string, string | string[] | undefined>; statusCode: number; body: Buffer }): ResponseLike {
    const requestUrl = new URL(gotResponse.url);
    return {
        headers: gotResponse.headers,
        statusCode: gotResponse.statusCode,
        body: Buffer.isBuffer(gotResponse.body) ? gotResponse.body : Buffer.from(String(gotResponse.body)),
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

async function performRequest(
    options: InternalOptions,
    params: DefaultParams | undefined,
    isFirstRequest: boolean,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const url = normalizeUrl(options);
    const mergedOpts = buildGotOptions(params, options);

    const requester = params?.requester ?? (await loadGot());
    let raw: { url: string; headers: Record<string, string | string[] | undefined>; statusCode: number; body: Buffer };
    try {
        const res: GotResponse = await requester(mergedOpts);
        raw = {
            url: res.url,
            headers: res.headers as Record<string, string | string[] | undefined>,
            statusCode: res.statusCode,
            body: Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.body)),
        };
    } catch (err: unknown) {
        throw new RequestError(err, options, undefined);
    }

    const response = buildResponse(raw);
    response.responseStartTime = Date.now();
    const headersCaseless = caseless(response.headers as Record<string, string>);
    response.isCloudflare = /^(cloudflare|sucuri)/i.test(String(headersCaseless.server ?? ""));
    response.isHTML = /text\/html/i.test(String(headersCaseless["content-type"] ?? ""));

    let body: Buffer = response.body as Buffer;

    if (/\bbr\b/i.test(String(headersCaseless["content-encoding"]))) {
        if (!brotli.isAvailable) {
            throw new RequestError(
                "Received a Brotli compressed response. Please install brotli",
                options,
                response,
            );
        }
        try {
            body = brotli.decompress!(body);
            response.body = body;
        } catch (err: unknown) {
            throw new RequestError(err, options, response);
        }
        if (options.json) {
            try {
                const parsed = JSON.parse(body.toString());
                response.body = parsed;
                return onRequestComplete(options, response, parsed);
            } catch {
                // fall through to HTML/challenge handling
            }
        }
    }

    if (response.isCloudflare && response.isHTML) {
        return onCloudflareResponse(options, params, response, body);
    }
    return onRequestComplete(options, response, body);
}

function onRequestComplete(
    options: InternalOptions,
    response: ResponseLike,
    body: Buffer | string | unknown,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
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

async function onCloudflareResponse(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike,
    body: Buffer,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    if (body.length < 1) {
        throw new CloudflareError(response.statusCode, options, response);
    }
    const stringBody = body.toString();

    try {
        validateResponse(options, response, stringBody);
    } catch (err: unknown) {
        if (err instanceof CaptchaError && typeof options.onCaptcha === "function") {
            return onCaptcha(options, params, response, stringBody);
        }
        throw err;
    }

    if (isOrchestrateChallenge(response, stringBody)) {
        return onOrchestrateChallenge(options, params, response, stringBody);
    }

    const isChallenge =
        stringBody.indexOf("a = document.getElementById('jschl-answer');") !== -1;
    if (isChallenge) {
        return onChallenge(options, params, response, stringBody);
    }

    const isRedirectChallenge =
        stringBody.indexOf("You are being redirected") !== -1 ||
        stringBody.indexOf("sucuri_cloudproxy_js") !== -1;
    if (isRedirectChallenge) {
        return onRedirectChallenge(options, params, response, stringBody);
    }

    if (response.statusCode === 503) {
        return onChallenge(options, params, response, stringBody);
    }

    return onRequestComplete(options, response, body);
}

/**
 * Detects Cloudflare's "Just a moment..." / orchestrate challenge page.
 * This page loads a script from challenge-platform and requires a real browser to solve.
 */
function isOrchestrateChallenge(response: ResponseLike, body: string): boolean {
    const hasJustAMoment =
        body.indexOf("Just a moment") !== -1 ||
        /<title[^>]*>[\s\S]*Just a moment[\s\S]*<\/title>/i.test(body);
    const hasOrchestrate =
        body.indexOf("_cf_chl_opt") !== -1 ||
        body.indexOf("challenge-platform") !== -1 ||
        body.indexOf("cdn-cgi/challenge-platform") !== -1;
    const hasCfMitigated =
        caseless(response.headers as Record<string, string>)["cf-mitigated"] === "challenge";
    const hasOldIuam = body.indexOf("a = document.getElementById('jschl-answer');") !== -1;
    return (hasCfMitigated || (hasJustAMoment && hasOrchestrate)) && !hasOldIuam;
}

async function onOrchestrateChallenge(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike,
    body: string,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const url = response.request?.uri?.href ?? normalizeUrl(options);
    const cookieJar =
        options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new CookieJar();

    const solver = params?.solveOrchestrateChallenge;
    if (typeof solver !== "function") {
        throw new OrchestrateChallengeError(options, response);
    }

    if (debugging) {
        console.warn("Cloudflare orchestrate challenge detected. Calling solveOrchestrateChallenge...");
    }
    await solver({ url, response, body, cookieJar });

    const newOptions: InternalOptions = {
        ...options,
        cookieJar,
    };
    return performRequest(newOptions, params, false);
}

function detectRecaptchaVersion(body: string): "ver1" | "ver2" | false {
    if (/__cf_chl_captcha_tk__=(.*)/i.test(body)) return "ver2";
    if (body.indexOf("why_captcha") !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body)) return "ver1";
    return false;
}

function validateResponse(
    _options: InternalOptions,
    response: ResponseLike,
    body: string,
): void {
    const recaptchaVer = detectRecaptchaVersion(body);
    if (recaptchaVer) {
        response.isCaptcha = true;
        throw new CaptchaError("captcha", _options, response);
    }
    const match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);
    if (match) {
        throw new CloudflareError(parseInt(match[1], 10), _options, response);
    }
}

async function onChallenge(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike,
    body: string,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const uri = response.request!.uri;
    const payload: Record<string, string | number> = {};

    if (options.challengesToSolve === 0) {
        const err = new CloudflareError("Cloudflare challenge loop", options, response);
        (err as { errorType?: number }).errorType = 4;
        throw err;
    }

    let timeout = parseInt((options as { cloudflareTimeout?: string }).cloudflareTimeout as string, 10);
    let match = body.match(/name="(.+?)" value="(.+?)"/);
    if (match) {
        payload[match[1]] = match[2];
    }
    match = body.match(/name="jschl_vc" value="(\w+)"/);
    if (!match) throw new ParserError("challengeId (jschl_vc) extraction failed", options, response);
    payload.jschl_vc = match[1];

    match = body.match(/name="pass" value="(.+?)"/);
    if (!match) throw new ParserError("Attribute (pass) value extraction failed", options, response);
    payload.pass = match[1];

    match = body.match(
        /getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value\s*=.+?)\r?\n(?:[^{<>]*},\s*(\d{4,}))?/,
    );
    if (!match) throw new ParserError("setTimeout callback extraction failed", options, response);

    if (isNaN(timeout)) {
        if (match[2] !== undefined) {
            timeout = parseInt(match[2], 10);
            if (timeout > options.cloudflareMaxTimeout) {
                if (debugging) {
                    console.warn("Cloudflare's timeout is excessive: " + timeout / 1000 + "s");
                }
                timeout = options.cloudflareMaxTimeout;
            }
        } else {
            throw new ParserError("Failed to parse challenge timeout", options, response);
        }
    }

    response.challenge = match[1] + "; a.value";
    try {
        const ctx = new Context({ hostname: uri.hostname, body });
        payload.jschl_answer = evaluate(response.challenge!, ctx);
    } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.message = "Challenge evaluation failed: " + e.message;
        throw new ParserError(e, options, response);
    }

    if (isNaN(payload.jschl_answer as number)) {
        throw new ParserError("Challenge answer is not a number", options, response);
    }

    const newOptions: InternalOptions = {
        ...options,
        headers: { ...options.headers, Referer: uri.href },
        challengesToSolve: options.challengesToSolve - 1,
    };

    match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
    if (match?.[2] === "POST") {
        newOptions.uri = uri.protocol + "//" + uri.host + match[1];
        newOptions.form = payload as Record<string, string>;
        newOptions.method = "POST";
        delete newOptions.qs;
    } else {
        newOptions.uri = uri.protocol + "//" + uri.host + "/cdn-cgi/l/chk_jschl";
        newOptions.qs = payload;
        delete newOptions.form;
    }
    newOptions.uri = newOptions.uri!.replace(/&amp;/g, "&");
    delete newOptions.baseUrl;
    delete newOptions.prefixUrl;

    const delay = Math.max(0, timeout - (Date.now() - (response.responseStartTime ?? 0)));
    await new Promise((r) => setTimeout(r, delay));
    return performRequest(newOptions, params, false);
}

async function onCaptcha(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike & { captcha?: object; rayId?: string; request?: { uri: { href: string; host: string; protocol: string } } },
    body: string,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const recaptchaVer = detectRecaptchaVersion(body);
    const isRecaptchaVer2 = recaptchaVer === "ver2";
    const handler = options.onCaptcha as ((opts: unknown, res: unknown, b: string) => void | Promise<unknown>) | undefined;
    const payload: Record<string, string> = {};

    let match = body.match(/<form(?: [^<>]*)? id=["']?challenge-form['"]?(?: [^<>]*)?>([\S\s]*?)<\/form>/);
    if (!match) throw new ParserError("Challenge form extraction failed", options, response);
    const form = match[1];

    let siteKey: string | undefined;
    let rayId: string | undefined;
    if (isRecaptchaVer2) {
        match = body.match(/\sdata-ray=["']?([^\s"'<>&]+)/);
        if (!match) throw new ParserError("Unable to find cloudflare ray id", options, response);
        rayId = match[1];
    }

    match = body.match(/\sdata-sitekey=["']?([^\s"'<>&]+)/);
    if (match) {
        siteKey = match[1];
    } else {
        const keys: string[] = [];
        const re = /\/recaptcha\/api2?\/(?:fallback|anchor|bframe)\?(?:[^\s<>]+&(?:amp;)?)?[Kk]=["']?([^\s"'<>&]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(body)) !== null) {
            if (m[0].indexOf("fallback") !== -1) keys.unshift(m[1]);
            else keys.push(m[1]);
        }
        siteKey = keys[0];
        if (!siteKey) throw new ParserError("Unable to find the reCAPTCHA site key", options, response);
        if (debugging) console.warn("Failed to find data-sitekey, using a fallback:", keys);
    }

    response.captcha = {
        siteKey,
        uri: response.request!.uri,
        form: payload,
        version: recaptchaVer,
    };
    if (isRecaptchaVer2) {
        response.rayId = rayId;
        match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
        if (!match) throw new ParserError("Challenge form action and method extraction failed", options, response);
        (response.captcha as Record<string, string>).formMethod = match[2];
        const actionMatch = match[1].match(/\/(.*)/);
        (response.captcha as Record<string, string>).formActionUri = actionMatch?.[0] ?? "";
        payload.id = rayId!;
    }

    Object.defineProperty(response.captcha, "url", {
        configurable: true,
        enumerable: false,
        get: deprecate(() => response.request!.uri.href, "captcha.url is deprecated. Please use captcha.uri instead."),
    });

    const inputs = form.match(/<input(?: [^<>]*)? name=[^<>]+>/g);
    if (!inputs) throw new ParserError("Challenge form is missing inputs", options, response);
    for (const input of inputs) {
        const nameMatch = input.match(/name=["']?([^\s"'<>]*)/);
        if (nameMatch) {
            const valueMatch = input.match(/value=["']?([^\s"'<>]*)/);
            if (valueMatch) payload[nameMatch[1]] = valueMatch[1];
        }
    }
    if (!payload.s && !payload.r) {
        throw new ParserError("Challenge form is missing secret input", options, response);
    }
    if (debugging) console.warn("Captcha:", response.captcha);

    return new Promise((resolve, reject) => {
        const submit = (error?: Error) => {
            if (error) {
                reject(new CaptchaError(error, options, response));
                return;
            }
            onSubmitCaptcha(options, params, response as ResponseLike & { captcha: { form: Record<string, string>; formActionUri?: string; formMethod?: string }; request?: { uri: { href: string; host: string; protocol: string } } }).then(resolve).catch(reject);
        };
        (response.captcha as { submit?: (err?: Error) => void }).submit = submit;
        const thenable = handler?.(options, response, body);
        if (thenable && typeof (thenable as Promise<unknown>)?.then === "function") {
            (thenable as Promise<unknown>).then(
                () => submit(),
                (err: unknown) => submit(err instanceof Error ? err : new Error(String(err))),
            );
        }
    });
}

async function onSubmitCaptcha(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike & { captcha: { form: Record<string, string>; formActionUri?: string; formMethod?: string }; request?: { uri: { href: string; host: string; protocol: string } } },
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    if (!response.captcha.form["g-recaptcha-response"]) {
        throw new CaptchaError("Form submission without g-recaptcha-response", options, response);
    }
    const uri = response.request!.uri;
    const isRecaptchaVer2 = (response.captcha as { version?: string }).version === "ver2";

    const newOptions: InternalOptions = {
        ...options,
        headers: { ...options.headers, Referer: uri.href },
    };
    if (isRecaptchaVer2) {
        newOptions.qs = {
            __cf_chl_captcha_tk__: response.captcha.formActionUri?.match(/__cf_chl_captcha_tk__=(.*)/)?.[1],
        };
        newOptions.form = response.captcha.form;
    } else {
        newOptions.qs = response.captcha.form;
    }
    newOptions.method = (response.captcha as { formMethod?: string }).formMethod || "GET";
    newOptions.uri =
        uri.protocol + "//" + uri.host + (isRecaptchaVer2 ? response.captcha.formActionUri! : "/cdn-cgi/l/chk_captcha");

    return performRequest(newOptions, params, false);
}

async function onRedirectChallenge(
    options: InternalOptions,
    params: DefaultParams | undefined,
    response: ResponseLike & { challenge?: string; request?: { uri: { href: string } } },
    body: string,
): Promise<{ response: ResponseLike; body: Buffer | string }> {
    const uri = response.request!.uri;
    const match = body.match(/S='([^']+)'/);
    if (!match) throw new ParserError("Cookie code extraction failed", options, response);

    response.challenge = Buffer.from(match[1], "base64").toString("ascii");
    try {
        const ctx = new Context();
        evaluate(response.challenge!, ctx);
        const jar = options.cookieJar ?? params?.cookieJar ?? params?.jar;
        const cookieStr = (ctx as unknown as { options?: { document?: { cookie?: string } } }).options?.document?.cookie;
        if (jar && cookieStr) {
            await new Promise<void>((resolve, reject) => {
                jar.setCookie(cookieStr, uri.href, { ignoreError: true }, (err: Error | null) =>
                    err ? reject(err) : resolve(),
                );
            });
        }
    } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.message = "Cookie code evaluation failed: " + e.message;
        throw new ParserError(e, options, response);
    }

    const newOptions: InternalOptions = {
        ...options,
        challengesToSolve: options.challengesToSolve - 1,
    };
    return performRequest(newOptions, params, false);
}

async function request(
    options?: Options,
    params?: DefaultParams,
    retries = 0,
): Promise<{ body: Buffer | string; [key: string]: unknown }> {
    const defaultParams: DefaultParams = {
        cookieJar: params?.cookieJar ?? params?.jar ?? new CookieJar(),
        headers: params?.headers ?? getDefaultHeaders({ Host: HOST }),
        cloudflareMaxTimeout: params?.cloudflareMaxTimeout ?? 30000,
        followRedirect: params?.followAllRedirects !== false,
        challengesToSolve: params?.challengesToSolve ?? 3,
        decodeEmails: params?.decodeEmails === true,
        decompress: params?.gzip !== false && params?.decompress !== false,
        https: params?.agentOptions?.ciphers
            ? { ciphers: params.agentOptions.ciphers }
            : { ciphers: crypto.constants.defaultCipherList + ":!ECDHE+SHA:!AES128-SHA" },
    };
    Object.assign(defaultParams, params);

    const merged: InternalOptions = {
        ...defaultParams,
        ...options,
        realEncoding: (options?.encoding as string) ?? "utf8",
        challengesToSolve: defaultParams.challengesToSolve ?? 3,
        cloudflareMaxTimeout: defaultParams.cloudflareMaxTimeout ?? 30000,
        decodeEmails: defaultParams.decodeEmails ?? false,
        decompress: defaultParams.decompress ?? true,
        followRedirect: defaultParams.followRedirect ?? true,
        headers: (options?.headers ?? defaultParams.headers ?? getDefaultHeaders({ Host: HOST })) as Record<string, string>,
        https: {
            ciphers:
                defaultParams.https?.ciphers ??
                defaultParams.agentOptions?.ciphers ??
                crypto.constants.defaultCipherList + ":!ECDHE+SHA:!AES128-SHA",
        },
    };

    try {
        const { response, body } = await performRequest(merged, defaultParams, true);
        if (typeof merged.realEncoding === "string" && response.body !== undefined) {
            return { ...response, body: response.body };
        }
        return { ...response, body };
    } catch (err: unknown) {
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
        debugging = !!value;
    },
    get() {
        return debugging;
    },
});

export { OrchestrateChallengeError } from "./errors";

type OrchestrateSolverFn = (context: OrchestrateChallengeContext) => Promise<void>;

/** Cookie shape used when setting on jar (and returned by FlareSolverr). */
interface CookieForJar {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
}

function setCookiesOnJar(
    cookieJar: CookieJar,
    url: string,
    cookies: Array<CookieForJar>,
): Promise<void> {
    const promises = cookies.map(
        (c) =>
            new Promise<void>((resolve, reject) => {
                const parts = [`${c.name}=${c.value}`];
                if (c.domain) parts.push(`Domain=${c.domain}`);
                if (c.path) parts.push(`Path=${c.path}`);
                if (c.expires) parts.push(`Expires=${new Date(c.expires * 1000).toUTCString()}`);
                if (c.httpOnly) parts.push("HttpOnly");
                if (c.secure) parts.push("Secure");
                cookieJar.setCookie(
                    parts.join("; "),
                    url,
                    { ignoreError: true },
                    (err: Error | null) => (err ? reject(err) : resolve()),
                );
            }),
    );
    return Promise.all(promises).then(() => {});
}

/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using a FlareSolverr instance.
 * Set env FLARESOLVERR_URL (e.g. http://localhost:8191/v1) to use FlareSolverr; the default
 * solver will try this first when the variable is set.
 */
export function createFlareSolverrOrchestrateSolver(baseUrl: string): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<void> => {
        const url = baseUrl.replace(/\/$/, "");
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cmd: "request.get",
                url: context.url,
                maxTimeout: 60000,
            }),
        });
        const data = (await res.json()) as {
            status?: string;
            message?: string;
            solution?: { cookies?: Array<CookieForJar> };
        };
        if (data.status !== "ok" || !data.solution?.cookies) {
            const msg = data.message || res.statusText || "FlareSolverr request failed";
            throw new Error(msg);
        }
        await setCookiesOnJar(context.cookieJar, context.url, data.solution.cookies);
    };
}

/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using Puppeteer.
 * Optional: install puppeteer to use. The browser will open the challenge URL,
 * run the Cloudflare script, and the resulting cookies are written to the jar.
 */
interface BrowserLike {
    newPage(): Promise<{
        goto(url: string, opts?: object): Promise<unknown>;
        cookies(): Promise<Array<{ name: string; value: string; domain?: string; path?: string; expires?: number; httpOnly?: boolean; secure?: boolean }>>;
    }>;
    close(): Promise<void>;
}

export function createPuppeteerOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<void> => {
        let puppeteer: { launch: (opts: object) => Promise<BrowserLike> };
        try {
            const m = await import("puppeteer");
            puppeteer = (m.default ?? m) as typeof puppeteer;
        } catch {
            throw new Error("Puppeteer not found. Install with: npm install puppeteer");
        }
        const browser = await puppeteer.launch({
            headless: options?.headless !== false,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        try {
            const page = await browser.newPage();
            await page.goto(context.url, {
                waitUntil: "load",
                timeout: options?.timeout ?? 45000,
            });
            const cookies = await page.cookies();
            await setCookiesOnJar(context.cookieJar, context.url, cookies);
        } finally {
            await browser.close();
        }
    };
}

/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using Playwright.
 * Optional: install playwright to use. Lighter than Puppeteer when using playwright-core
 * with a system browser. The browser will open the challenge URL and cookies are written to the jar.
 */
export function createPlaywrightOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<void> => {
        let playwright: { chromium: { launch: (opts: object) => Promise<PlaywrightBrowserLike> } };
        try {
            const m = await import("playwright");
            playwright = (m.default ?? m) as typeof playwright;
        } catch {
            throw new Error("Playwright not found. Install with: npm install playwright");
        }
        const browser = await playwright.chromium.launch({
            headless: options?.headless !== false,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        try {
            const page = await browser.newPage();
            await page.goto(context.url, {
                waitUntil: "load",
                timeout: options?.timeout ?? 45000,
            });
            const ctx = page.context();
            const cookies = await ctx.cookies(context.url);
            await setCookiesOnJar(context.cookieJar, context.url, cookies);
        } finally {
            await browser.close();
        }
    };
}

interface PlaywrightBrowserLike {
    newPage(): Promise<{
        goto(url: string, opts?: object): Promise<unknown>;
        context(): { cookies(url?: string): Promise<Array<{ name: string; value: string; domain?: string; path?: string; expires?: number; httpOnly?: boolean; secure?: boolean }>> };
    }>;
    close(): Promise<void>;
}

let defaultOrchestrateSolver: OrchestrateSolverFn | null = null;

/**
 * Returns a solver that tries, in order: FlareSolverr (if FLARESOLVERR_URL is set),
 * then Puppeteer, then Playwright. Puppeteer and Playwright are optional; install one
 * if you don't use FlareSolverr. If none are available, the solver throws when used.
 */
export function createDefaultOrchestrateSolver(options?: {
    headless?: boolean;
    timeout?: number;
}): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<void> => {
        if (defaultOrchestrateSolver) {
            return defaultOrchestrateSolver(context);
        }
        const flaresolverrUrl =
            typeof process !== "undefined" && process.env && process.env.FLARESOLVERR_URL;
        if (flaresolverrUrl && flaresolverrUrl.trim()) {
            try {
                const solver = createFlareSolverrOrchestrateSolver(flaresolverrUrl.trim());
                await solver(context);
                defaultOrchestrateSolver = solver;
                return;
            } catch (e0) {
                // Fall through to Puppeteer/Playwright
            }
        }
        try {
            const solver = createPuppeteerOrchestrateSolver(options);
            await solver(context);
            defaultOrchestrateSolver = solver;
        } catch (e1) {
            try {
                const solver = createPlaywrightOrchestrateSolver(options);
                await solver(context);
                defaultOrchestrateSolver = solver;
            } catch (e2) {
                const inner = e2 instanceof Error ? e2.message : String(e2);
                // Only treat as "no browser" when package or executable is missing; rethrow timeouts/network errors
                const isMissingBrowser =
                    /Cannot find module|Module not found|playwright.*not found/i.test(inner) ||
                    (inner.includes("Executable") && inner.includes("does not exist")) ||
                    /browser.*not found|could not find.*browser/i.test(inner);
                if (!isMissingBrowser) {
                    throw e2;
                }
                const hint = /Executable|browser/i.test(inner)
                    ? " Run: npx playwright install chromium"
                    : "";
                throw new Error(
                    "No headless browser available. Install one of: npm install puppeteer  OR  npm install playwright." +
                        hint +
                        (inner ? " (" + inner + ")" : ""),
                    { cause: e2 },
                );
            }
        }
    };
}

export default request;
