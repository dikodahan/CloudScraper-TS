"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errors = exports.RequestError = exports.ParserError = exports.OrchestrateLoopError = exports.OrchestrateChallengeError = exports.FlareSolverrError = exports.CloudflareError = exports.AccessDeniedError = exports.closeBrowserPool = exports.createDefaultOrchestrateSolver = exports.destroyFlareSolverrSession = exports.createFlareSolverrOrchestrateSolver = exports.createPuppeteerOrchestrateSolver = exports.createBrowserlessOrchestrateSolver = exports.createPlaywrightOrchestrateSolver = exports.createPatchrightOrchestrateSolver = exports.setCookiesOnJar = exports.shouldHandleChallenge = exports.extractSucuriCookie = exports.isSucuriRedirect = exports.isOrchestrateChallenge = exports.isAccessDeniedPage = void 0;
const tough_cookie_1 = require("tough-cookie");
const email_decode_1 = __importDefault(require("./lib/email-decode"));
const caseless_1 = require("./lib/caseless");
const detect_1 = require("./lib/detect");
const debug_dump_1 = require("./lib/debug-dump");
const logger_1 = require("./lib/logger");
const cookies_1 = require("./lib/cookies");
const solver_types_1 = require("./lib/solver-types");
const errors_1 = require("./errors");
const resolve_1 = require("./transports/resolve");
var detect_2 = require("./lib/detect");
Object.defineProperty(exports, "isAccessDeniedPage", { enumerable: true, get: function () { return detect_2.isAccessDeniedPage; } });
Object.defineProperty(exports, "isOrchestrateChallenge", { enumerable: true, get: function () { return detect_2.isOrchestrateChallenge; } });
Object.defineProperty(exports, "isSucuriRedirect", { enumerable: true, get: function () { return detect_2.isSucuriRedirect; } });
Object.defineProperty(exports, "extractSucuriCookie", { enumerable: true, get: function () { return detect_2.extractSucuriCookie; } });
Object.defineProperty(exports, "shouldHandleChallenge", { enumerable: true, get: function () { return detect_2.shouldHandleChallenge; } });
var cookies_2 = require("./lib/cookies");
Object.defineProperty(exports, "setCookiesOnJar", { enumerable: true, get: function () { return cookies_2.setCookiesOnJar; } });
var chromium_1 = require("./solvers/chromium");
Object.defineProperty(exports, "createPatchrightOrchestrateSolver", { enumerable: true, get: function () { return chromium_1.createPatchrightOrchestrateSolver; } });
Object.defineProperty(exports, "createPlaywrightOrchestrateSolver", { enumerable: true, get: function () { return chromium_1.createPlaywrightOrchestrateSolver; } });
var puppeteer_1 = require("./solvers/puppeteer");
Object.defineProperty(exports, "createBrowserlessOrchestrateSolver", { enumerable: true, get: function () { return puppeteer_1.createBrowserlessOrchestrateSolver; } });
Object.defineProperty(exports, "createPuppeteerOrchestrateSolver", { enumerable: true, get: function () { return puppeteer_1.createPuppeteerOrchestrateSolver; } });
var flaresolverr_1 = require("./solvers/flaresolverr");
Object.defineProperty(exports, "createFlareSolverrOrchestrateSolver", { enumerable: true, get: function () { return flaresolverr_1.createFlareSolverrOrchestrateSolver; } });
Object.defineProperty(exports, "destroyFlareSolverrSession", { enumerable: true, get: function () { return flaresolverr_1.destroyFlareSolverrSession; } });
var default_1 = require("./solvers/default");
Object.defineProperty(exports, "createDefaultOrchestrateSolver", { enumerable: true, get: function () { return default_1.createDefaultOrchestrateSolver; } });
var browser_pool_1 = require("./browser-pool");
Object.defineProperty(exports, "closeBrowserPool", { enumerable: true, get: function () { return browser_pool_1.closeBrowserPool; } });
const HOST = "__CLOUDSCRAPER_HOST__";
function normalizeUrl(opts) {
    const url = opts.uri ?? opts.url;
    if (typeof url !== "string") {
        throw new TypeError("Expected `uri` or `url` option to be a string");
    }
    const base = opts.prefixUrl ?? opts.baseUrl ?? "";
    return base ? new URL(url, base.endsWith("/") ? base : base + "/").href : url;
}
function normalizeRequestHeaders(headers, url) {
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = value;
    }
    try {
        out.host = new URL(url).host;
    }
    catch {
        delete out.host;
    }
    return out;
}
function lowercaseHeaders(headers) {
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        out[key.toLowerCase()] = value;
    }
    return out;
}
function buildTransportRequest(params, opts) {
    const url = normalizeUrl(opts);
    const headers = normalizeRequestHeaders({ ...opts.headers }, url);
    const timeout = opts.timeout ?? params?.timeout;
    const retry = opts.retry ?? params?.retry;
    const transportOpts = {
        method: opts.method ?? "GET",
        headers,
        followRedirect: opts.followRedirect !== false,
        timeout,
        retry,
    };
    if (opts.qs && Object.keys(opts.qs).length > 0) {
        transportOpts.searchParams = opts.qs;
    }
    const form = opts.form ?? opts.formData;
    if (form && Object.keys(form).length > 0) {
        transportOpts.form = form;
    }
    if (typeof opts.json === "object") {
        transportOpts.json = opts.json;
    }
    return { url, transportOpts };
}
function buildResponse(raw) {
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
async function performRequest(options, params) {
    const merged = buildTransportRequest(params, options);
    const cookieJar = options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar();
    const transport = await (0, resolve_1.resolveTransport)({
        requester: params?.requester,
        impersonate: params?.impersonate ?? options.impersonate,
        proxy: params?.proxy ?? options.proxy,
        timeout: merged.transportOpts.timeout,
        followRedirect: options.followRedirect,
    }, cookieJar);
    let raw;
    try {
        const res = await transport.request(merged.url, merged.transportOpts);
        raw = {
            url: res.url,
            headers: res.headers,
            statusCode: res.status,
            body: res.body,
        };
    }
    catch (err) {
        throw new errors_1.RequestError(err, options, undefined);
    }
    const response = buildResponse(raw);
    response.responseStartTime = Date.now();
    const headersCaseless = (0, caseless_1.caseless)(response.headers);
    response.isCloudflare = /^(cloudflare|sucuri|ddos-guard)/i.test(String(headersCaseless.server ?? ""));
    response.isHTML = /text\/html/i.test(String(headersCaseless["content-type"] ?? ""));
    const body = response.body;
    const stringBody = body.toString("utf8");
    if ((0, detect_1.shouldHandleChallenge)({ headers: response.headers, statusCode: response.statusCode }, stringBody)) {
        return onCloudflareResponse(options, params, response, body);
    }
    return onRequestComplete(options, response, body);
}
function onRequestComplete(options, response, body) {
    const encoding = (options.realEncoding ?? "utf8");
    if (typeof encoding === "string" && typeof body !== "string") {
        const str = Buffer.isBuffer(body) ? body.toString(encoding) : String(body);
        if (response.isHTML && options.decodeEmails) {
            response.body = (0, email_decode_1.default)(str);
        }
        else {
            response.body = str;
        }
        return Promise.resolve({ response, body: response.body });
    }
    return Promise.resolve({ response, body: body });
}
async function onCloudflareResponse(options, params, response, body) {
    if (body.length < 1) {
        throw new errors_1.CloudflareError(response.statusCode, options, response);
    }
    const stringBody = body.toString();
    if ((0, detect_1.isAccessDeniedPage)(stringBody)) {
        throw new errors_1.AccessDeniedError(options, response);
    }
    validateResponse(options, response, stringBody);
    if ((0, detect_1.isOrchestrateChallenge)(response, stringBody)) {
        return onOrchestrateChallenge(options, params, response, stringBody);
    }
    if ((0, detect_1.isSucuriRedirect)(stringBody)) {
        return onRedirectChallenge(options, params, response, stringBody);
    }
    return onRequestComplete(options, response, body);
}
function encodePostData(opts) {
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
        for (const [k, v] of Object.entries(opts.json)) {
            if (v === undefined)
                continue;
            sp.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
        return sp.toString();
    }
    return undefined;
}
function validateResponse(_options, response, body) {
    const match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);
    if (match) {
        throw new errors_1.CloudflareError(parseInt(match[1], 10), _options, response);
    }
}
async function onOrchestrateChallenge(options, params, response, body) {
    if (options.challengesToSolve <= 0) {
        throw new errors_1.OrchestrateLoopError(options, response);
    }
    const url = response.request?.uri?.href ?? normalizeUrl(options);
    const cookieJar = options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar();
    const solver = params?.solveOrchestrateChallenge;
    if (typeof solver !== "function") {
        throw new errors_1.OrchestrateChallengeError(options, response);
    }
    const context = {
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
    (0, logger_1.log)(context.logger, "warn", "Cloudflare orchestrate challenge detected. Calling solveOrchestrateChallenge...");
    let result;
    try {
        result = await solver(context);
    }
    catch (err) {
        const extra = {};
        if (err instanceof errors_1.FlareSolverrError && err.screenshot) {
            extra["screenshot.png"] = Buffer.from(err.screenshot, "base64");
        }
        await (0, debug_dump_1.dumpOnSolverFailure)(context, err, extra);
        throw err;
    }
    const newOptions = {
        ...options,
        cookieJar,
        challengesToSolve: options.challengesToSolve - 1,
        headers: lowercaseHeaders(options.headers),
    };
    if ((0, solver_types_1.isSolverResult)(result)) {
        newOptions.headers["user-agent"] = result.userAgent;
        if (result.cookies?.length) {
            await (0, cookies_1.setCookiesOnJar)(cookieJar, url, result.cookies);
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
                }
                catch {
                    /* keep original */
                }
            }
            const synth = {
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
async function onRedirectChallenge(options, params, response, body) {
    const uri = response.request.uri;
    const cookieStr = (0, detect_1.extractSucuriCookie)(body);
    if (!cookieStr) {
        throw new errors_1.ParserError("Cookie code extraction failed", options, response);
    }
    const jar = options.cookieJar ?? params?.cookieJar ?? params?.jar;
    if (jar) {
        await jar.setCookie(cookieStr, uri.href, { ignoreError: true });
    }
    const newOptions = {
        ...options,
        challengesToSolve: options.challengesToSolve - 1,
    };
    return performRequest(newOptions, params);
}
async function request(options, params, retries = 0) {
    const defaultParams = {
        cookieJar: params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar(),
        headers: params?.headers ?? { ...caseless_1.DEFAULT_HEADERS, Host: HOST },
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
    const merged = {
        ...defaultParams,
        ...options,
        realEncoding: options?.encoding ?? "utf8",
        challengesToSolve: defaultParams.challengesToSolve ?? 3,
        decodeEmails: defaultParams.decodeEmails ?? false,
        decompress: defaultParams.decompress ?? true,
        followRedirect: defaultParams.followRedirect ?? true,
        headers: (options?.headers ?? defaultParams.headers ?? { ...caseless_1.DEFAULT_HEADERS, Host: HOST }),
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
    }
    catch (err) {
        if (err instanceof errors_1.AccessDeniedError || err instanceof errors_1.OrchestrateLoopError || err instanceof errors_1.OrchestrateChallengeError || err instanceof errors_1.ParserError || err instanceof errors_1.CloudflareError || err instanceof errors_1.FlareSolverrError) {
            throw err;
        }
        const errObj = err;
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
    set(value) {
        (0, logger_1.setDebugShim)(!!value);
    },
    get() {
        return (0, logger_1.isDebugShimEnabled)();
    },
});
var errors_2 = require("./errors");
Object.defineProperty(exports, "AccessDeniedError", { enumerable: true, get: function () { return errors_2.AccessDeniedError; } });
Object.defineProperty(exports, "CloudflareError", { enumerable: true, get: function () { return errors_2.CloudflareError; } });
Object.defineProperty(exports, "FlareSolverrError", { enumerable: true, get: function () { return errors_2.FlareSolverrError; } });
Object.defineProperty(exports, "OrchestrateChallengeError", { enumerable: true, get: function () { return errors_2.OrchestrateChallengeError; } });
Object.defineProperty(exports, "OrchestrateLoopError", { enumerable: true, get: function () { return errors_2.OrchestrateLoopError; } });
Object.defineProperty(exports, "ParserError", { enumerable: true, get: function () { return errors_2.ParserError; } });
Object.defineProperty(exports, "RequestError", { enumerable: true, get: function () { return errors_2.RequestError; } });
Object.defineProperty(exports, "errors", { enumerable: true, get: function () { return errors_2.errors; } });
exports.default = request;
