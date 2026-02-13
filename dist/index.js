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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestrateChallengeError = void 0;
exports.createFlareSolverrOrchestrateSolver = createFlareSolverrOrchestrateSolver;
exports.createPuppeteerOrchestrateSolver = createPuppeteerOrchestrateSolver;
exports.createPlaywrightOrchestrateSolver = createPlaywrightOrchestrateSolver;
exports.createDefaultOrchestrateSolver = createDefaultOrchestrateSolver;
const tough_cookie_1 = require("tough-cookie");
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
let gotPromise = null;
async function loadGot() {
    if (!gotPromise) {
        gotPromise = Promise.resolve().then(() => __importStar(require("got"))).then((m) => m.default);
    }
    return gotPromise;
}
const sandbox_1 = require("./lib/sandbox");
const email_decode_1 = __importDefault(require("./lib/email-decode"));
const headers_1 = require("./lib/headers");
const brotli_1 = __importDefault(require("./lib/brotli"));
const errors_1 = require("./errors");
let debugging = false;
const HOST = "__CLOUDSCRAPER_HOST__";
function normalizeUrl(opts) {
    const url = opts.uri ?? opts.url;
    if (typeof url !== "string") {
        throw new TypeError("Expected `uri` or `url` option to be a string");
    }
    const base = opts.prefixUrl ?? opts.baseUrl ?? "";
    return base ? new URL(url, base.endsWith("/") ? base : base + "/").href : url;
}
function buildGotOptions(params, opts) {
    const url = normalizeUrl(opts);
    const cookieJar = opts.cookieJar ?? params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar();
    const headers = { ...opts.headers };
    if (headers.Host === HOST) {
        try {
            const u = new URL(url);
            headers.host = u.host;
        }
        catch {
            delete headers.Host;
        }
    }
    const gotOpts = {
        url,
        method: opts.method ?? "GET",
        headers,
        cookieJar,
        followRedirect: opts.followRedirect !== false,
        decompress: opts.decompress !== false,
        responseType: "buffer",
        throwHttpErrors: false,
        https: opts.https ?? (params?.agentOptions?.ciphers
            ? { ciphers: params.agentOptions.ciphers }
            : {
                ciphers: crypto_1.default.constants.defaultCipherList +
                    ":!ECDHE+SHA:!AES128-SHA",
            }),
    };
    if (opts.qs && Object.keys(opts.qs).length > 0) {
        gotOpts.searchParams = opts.qs;
    }
    const form = opts.form ?? opts.formData;
    if (form && Object.keys(form).length > 0) {
        gotOpts.form = form;
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
function buildResponse(gotResponse) {
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
async function performRequest(options, params, isFirstRequest) {
    const url = normalizeUrl(options);
    const mergedOpts = buildGotOptions(params, options);
    const requester = params?.requester ?? (await loadGot());
    let raw;
    try {
        const res = await requester(mergedOpts);
        raw = {
            url: res.url,
            headers: res.headers,
            statusCode: res.statusCode,
            body: Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.body)),
        };
    }
    catch (err) {
        throw new errors_1.RequestError(err, options, undefined);
    }
    const response = buildResponse(raw);
    response.responseStartTime = Date.now();
    const headersCaseless = (0, headers_1.caseless)(response.headers);
    response.isCloudflare = /^(cloudflare|sucuri)/i.test(String(headersCaseless.server ?? ""));
    response.isHTML = /text\/html/i.test(String(headersCaseless["content-type"] ?? ""));
    let body = response.body;
    if (/\bbr\b/i.test(String(headersCaseless["content-encoding"]))) {
        if (!brotli_1.default.isAvailable) {
            throw new errors_1.RequestError("Received a Brotli compressed response. Please install brotli", options, response);
        }
        try {
            body = brotli_1.default.decompress(body);
            response.body = body;
        }
        catch (err) {
            throw new errors_1.RequestError(err, options, response);
        }
        if (options.json) {
            try {
                const parsed = JSON.parse(body.toString());
                response.body = parsed;
                return onRequestComplete(options, response, parsed);
            }
            catch {
                // fall through to HTML/challenge handling
            }
        }
    }
    if (response.isCloudflare && response.isHTML) {
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
    try {
        validateResponse(options, response, stringBody);
    }
    catch (err) {
        if (err instanceof errors_1.CaptchaError && typeof options.onCaptcha === "function") {
            return onCaptcha(options, params, response, stringBody);
        }
        throw err;
    }
    if (isOrchestrateChallenge(response, stringBody)) {
        return onOrchestrateChallenge(options, params, response, stringBody);
    }
    const isChallenge = stringBody.indexOf("a = document.getElementById('jschl-answer');") !== -1;
    if (isChallenge) {
        return onChallenge(options, params, response, stringBody);
    }
    const isRedirectChallenge = stringBody.indexOf("You are being redirected") !== -1 ||
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
function isOrchestrateChallenge(response, body) {
    const hasJustAMoment = body.indexOf("Just a moment") !== -1 ||
        /<title[^>]*>[\s\S]*Just a moment[\s\S]*<\/title>/i.test(body);
    const hasOrchestrate = body.indexOf("_cf_chl_opt") !== -1 ||
        body.indexOf("challenge-platform") !== -1 ||
        body.indexOf("cdn-cgi/challenge-platform") !== -1;
    const hasCfMitigated = (0, headers_1.caseless)(response.headers)["cf-mitigated"] === "challenge";
    const hasOldIuam = body.indexOf("a = document.getElementById('jschl-answer');") !== -1;
    return (hasCfMitigated || (hasJustAMoment && hasOrchestrate)) && !hasOldIuam;
}
async function onOrchestrateChallenge(options, params, response, body) {
    const url = response.request?.uri?.href ?? normalizeUrl(options);
    const cookieJar = options.cookieJar ?? params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar();
    const solver = params?.solveOrchestrateChallenge;
    if (typeof solver !== "function") {
        throw new errors_1.OrchestrateChallengeError(options, response);
    }
    if (debugging) {
        console.warn("Cloudflare orchestrate challenge detected. Calling solveOrchestrateChallenge...");
    }
    await solver({ url, response, body, cookieJar });
    const newOptions = {
        ...options,
        cookieJar,
    };
    return performRequest(newOptions, params, false);
}
function detectRecaptchaVersion(body) {
    if (/__cf_chl_captcha_tk__=(.*)/i.test(body))
        return "ver2";
    if (body.indexOf("why_captcha") !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body))
        return "ver1";
    return false;
}
function validateResponse(_options, response, body) {
    const recaptchaVer = detectRecaptchaVersion(body);
    if (recaptchaVer) {
        response.isCaptcha = true;
        throw new errors_1.CaptchaError("captcha", _options, response);
    }
    const match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);
    if (match) {
        throw new errors_1.CloudflareError(parseInt(match[1], 10), _options, response);
    }
}
async function onChallenge(options, params, response, body) {
    const uri = response.request.uri;
    const payload = {};
    if (options.challengesToSolve === 0) {
        const err = new errors_1.CloudflareError("Cloudflare challenge loop", options, response);
        err.errorType = 4;
        throw err;
    }
    let timeout = parseInt(options.cloudflareTimeout, 10);
    let match = body.match(/name="(.+?)" value="(.+?)"/);
    if (match) {
        payload[match[1]] = match[2];
    }
    match = body.match(/name="jschl_vc" value="(\w+)"/);
    if (!match)
        throw new errors_1.ParserError("challengeId (jschl_vc) extraction failed", options, response);
    payload.jschl_vc = match[1];
    match = body.match(/name="pass" value="(.+?)"/);
    if (!match)
        throw new errors_1.ParserError("Attribute (pass) value extraction failed", options, response);
    payload.pass = match[1];
    match = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value\s*=.+?)\r?\n(?:[^{<>]*},\s*(\d{4,}))?/);
    if (!match)
        throw new errors_1.ParserError("setTimeout callback extraction failed", options, response);
    if (isNaN(timeout)) {
        if (match[2] !== undefined) {
            timeout = parseInt(match[2], 10);
            if (timeout > options.cloudflareMaxTimeout) {
                if (debugging) {
                    console.warn("Cloudflare's timeout is excessive: " + timeout / 1000 + "s");
                }
                timeout = options.cloudflareMaxTimeout;
            }
        }
        else {
            throw new errors_1.ParserError("Failed to parse challenge timeout", options, response);
        }
    }
    response.challenge = match[1] + "; a.value";
    try {
        const ctx = new sandbox_1.Context({ hostname: uri.hostname, body });
        payload.jschl_answer = (0, sandbox_1.evaluate)(response.challenge, ctx);
    }
    catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.message = "Challenge evaluation failed: " + e.message;
        throw new errors_1.ParserError(e, options, response);
    }
    if (isNaN(payload.jschl_answer)) {
        throw new errors_1.ParserError("Challenge answer is not a number", options, response);
    }
    const newOptions = {
        ...options,
        headers: { ...options.headers, Referer: uri.href },
        challengesToSolve: options.challengesToSolve - 1,
    };
    match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
    if (match?.[2] === "POST") {
        newOptions.uri = uri.protocol + "//" + uri.host + match[1];
        newOptions.form = payload;
        newOptions.method = "POST";
        delete newOptions.qs;
    }
    else {
        newOptions.uri = uri.protocol + "//" + uri.host + "/cdn-cgi/l/chk_jschl";
        newOptions.qs = payload;
        delete newOptions.form;
    }
    newOptions.uri = newOptions.uri.replace(/&amp;/g, "&");
    delete newOptions.baseUrl;
    delete newOptions.prefixUrl;
    const delay = Math.max(0, timeout - (Date.now() - (response.responseStartTime ?? 0)));
    await new Promise((r) => setTimeout(r, delay));
    return performRequest(newOptions, params, false);
}
async function onCaptcha(options, params, response, body) {
    const recaptchaVer = detectRecaptchaVersion(body);
    const isRecaptchaVer2 = recaptchaVer === "ver2";
    const handler = options.onCaptcha;
    const payload = {};
    let match = body.match(/<form(?: [^<>]*)? id=["']?challenge-form['"]?(?: [^<>]*)?>([\S\s]*?)<\/form>/);
    if (!match)
        throw new errors_1.ParserError("Challenge form extraction failed", options, response);
    const form = match[1];
    let siteKey;
    let rayId;
    if (isRecaptchaVer2) {
        match = body.match(/\sdata-ray=["']?([^\s"'<>&]+)/);
        if (!match)
            throw new errors_1.ParserError("Unable to find cloudflare ray id", options, response);
        rayId = match[1];
    }
    match = body.match(/\sdata-sitekey=["']?([^\s"'<>&]+)/);
    if (match) {
        siteKey = match[1];
    }
    else {
        const keys = [];
        const re = /\/recaptcha\/api2?\/(?:fallback|anchor|bframe)\?(?:[^\s<>]+&(?:amp;)?)?[Kk]=["']?([^\s"'<>&]+)/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            if (m[0].indexOf("fallback") !== -1)
                keys.unshift(m[1]);
            else
                keys.push(m[1]);
        }
        siteKey = keys[0];
        if (!siteKey)
            throw new errors_1.ParserError("Unable to find the reCAPTCHA site key", options, response);
        if (debugging)
            console.warn("Failed to find data-sitekey, using a fallback:", keys);
    }
    response.captcha = {
        siteKey,
        uri: response.request.uri,
        form: payload,
        version: recaptchaVer,
    };
    if (isRecaptchaVer2) {
        response.rayId = rayId;
        match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
        if (!match)
            throw new errors_1.ParserError("Challenge form action and method extraction failed", options, response);
        response.captcha.formMethod = match[2];
        const actionMatch = match[1].match(/\/(.*)/);
        response.captcha.formActionUri = actionMatch?.[0] ?? "";
        payload.id = rayId;
    }
    Object.defineProperty(response.captcha, "url", {
        configurable: true,
        enumerable: false,
        get: (0, util_1.deprecate)(() => response.request.uri.href, "captcha.url is deprecated. Please use captcha.uri instead."),
    });
    const inputs = form.match(/<input(?: [^<>]*)? name=[^<>]+>/g);
    if (!inputs)
        throw new errors_1.ParserError("Challenge form is missing inputs", options, response);
    for (const input of inputs) {
        const nameMatch = input.match(/name=["']?([^\s"'<>]*)/);
        if (nameMatch) {
            const valueMatch = input.match(/value=["']?([^\s"'<>]*)/);
            if (valueMatch)
                payload[nameMatch[1]] = valueMatch[1];
        }
    }
    if (!payload.s && !payload.r) {
        throw new errors_1.ParserError("Challenge form is missing secret input", options, response);
    }
    if (debugging)
        console.warn("Captcha:", response.captcha);
    return new Promise((resolve, reject) => {
        const submit = (error) => {
            if (error) {
                reject(new errors_1.CaptchaError(error, options, response));
                return;
            }
            onSubmitCaptcha(options, params, response).then(resolve).catch(reject);
        };
        response.captcha.submit = submit;
        const thenable = handler?.(options, response, body);
        if (thenable && typeof thenable?.then === "function") {
            thenable.then(() => submit(), (err) => submit(err instanceof Error ? err : new Error(String(err))));
        }
    });
}
async function onSubmitCaptcha(options, params, response) {
    if (!response.captcha.form["g-recaptcha-response"]) {
        throw new errors_1.CaptchaError("Form submission without g-recaptcha-response", options, response);
    }
    const uri = response.request.uri;
    const isRecaptchaVer2 = response.captcha.version === "ver2";
    const newOptions = {
        ...options,
        headers: { ...options.headers, Referer: uri.href },
    };
    if (isRecaptchaVer2) {
        newOptions.qs = {
            __cf_chl_captcha_tk__: response.captcha.formActionUri?.match(/__cf_chl_captcha_tk__=(.*)/)?.[1],
        };
        newOptions.form = response.captcha.form;
    }
    else {
        newOptions.qs = response.captcha.form;
    }
    newOptions.method = response.captcha.formMethod || "GET";
    newOptions.uri =
        uri.protocol + "//" + uri.host + (isRecaptchaVer2 ? response.captcha.formActionUri : "/cdn-cgi/l/chk_captcha");
    return performRequest(newOptions, params, false);
}
async function onRedirectChallenge(options, params, response, body) {
    const uri = response.request.uri;
    const match = body.match(/S='([^']+)'/);
    if (!match)
        throw new errors_1.ParserError("Cookie code extraction failed", options, response);
    response.challenge = Buffer.from(match[1], "base64").toString("ascii");
    try {
        const ctx = new sandbox_1.Context();
        (0, sandbox_1.evaluate)(response.challenge, ctx);
        const jar = options.cookieJar ?? params?.cookieJar ?? params?.jar;
        const cookieStr = ctx.options?.document?.cookie;
        if (jar && cookieStr) {
            await new Promise((resolve, reject) => {
                jar.setCookie(cookieStr, uri.href, { ignoreError: true }, (err) => err ? reject(err) : resolve());
            });
        }
    }
    catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        e.message = "Cookie code evaluation failed: " + e.message;
        throw new errors_1.ParserError(e, options, response);
    }
    const newOptions = {
        ...options,
        challengesToSolve: options.challengesToSolve - 1,
    };
    return performRequest(newOptions, params, false);
}
async function request(options, params, retries = 0) {
    const defaultParams = {
        cookieJar: params?.cookieJar ?? params?.jar ?? new tough_cookie_1.CookieJar(),
        headers: params?.headers ?? (0, headers_1.getDefaultHeaders)({ Host: HOST }),
        cloudflareMaxTimeout: params?.cloudflareMaxTimeout ?? 30000,
        followRedirect: params?.followAllRedirects !== false,
        challengesToSolve: params?.challengesToSolve ?? 3,
        decodeEmails: params?.decodeEmails === true,
        decompress: params?.gzip !== false && params?.decompress !== false,
        https: params?.agentOptions?.ciphers
            ? { ciphers: params.agentOptions.ciphers }
            : { ciphers: crypto_1.default.constants.defaultCipherList + ":!ECDHE+SHA:!AES128-SHA" },
    };
    Object.assign(defaultParams, params);
    const merged = {
        ...defaultParams,
        ...options,
        realEncoding: options?.encoding ?? "utf8",
        challengesToSolve: defaultParams.challengesToSolve ?? 3,
        cloudflareMaxTimeout: defaultParams.cloudflareMaxTimeout ?? 30000,
        decodeEmails: defaultParams.decodeEmails ?? false,
        decompress: defaultParams.decompress ?? true,
        followRedirect: defaultParams.followRedirect ?? true,
        headers: (options?.headers ?? defaultParams.headers ?? (0, headers_1.getDefaultHeaders)({ Host: HOST })),
        https: {
            ciphers: defaultParams.https?.ciphers ??
                defaultParams.agentOptions?.ciphers ??
                crypto_1.default.constants.defaultCipherList + ":!ECDHE+SHA:!AES128-SHA",
        },
    };
    try {
        const { response, body } = await performRequest(merged, defaultParams, true);
        if (typeof merged.realEncoding === "string" && response.body !== undefined) {
            return { ...response, body: response.body };
        }
        return { ...response, body };
    }
    catch (err) {
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
        debugging = !!value;
    },
    get() {
        return debugging;
    },
});
var errors_2 = require("./errors");
Object.defineProperty(exports, "OrchestrateChallengeError", { enumerable: true, get: function () { return errors_2.OrchestrateChallengeError; } });
function setCookiesOnJar(cookieJar, url, cookies) {
    const promises = cookies.map((c) => new Promise((resolve, reject) => {
        const parts = [`${c.name}=${c.value}`];
        if (c.domain)
            parts.push(`Domain=${c.domain}`);
        if (c.path)
            parts.push(`Path=${c.path}`);
        if (c.expires)
            parts.push(`Expires=${new Date(c.expires * 1000).toUTCString()}`);
        if (c.httpOnly)
            parts.push("HttpOnly");
        if (c.secure)
            parts.push("Secure");
        cookieJar.setCookie(parts.join("; "), url, { ignoreError: true }, (err) => (err ? reject(err) : resolve()));
    }));
    return Promise.all(promises).then(() => { });
}
/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using a FlareSolverr instance.
 * Set env FLARESOLVERR_URL (e.g. http://localhost:8191/v1) to use FlareSolverr; the default
 * solver will try this first when the variable is set.
 */
function createFlareSolverrOrchestrateSolver(baseUrl) {
    return async (context) => {
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
        const data = (await res.json());
        if (data.status !== "ok" || !data.solution?.cookies) {
            const msg = data.message || res.statusText || "FlareSolverr request failed";
            throw new Error(msg);
        }
        await setCookiesOnJar(context.cookieJar, context.url, data.solution.cookies);
    };
}
function createPuppeteerOrchestrateSolver(options) {
    return async (context) => {
        let puppeteer;
        try {
            const m = await Promise.resolve().then(() => __importStar(require("puppeteer")));
            puppeteer = (m.default ?? m);
        }
        catch {
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
        }
        finally {
            await browser.close();
        }
    };
}
/**
 * Returns a solver for the "Just a moment..." orchestrate challenge using Playwright.
 * Optional: install playwright to use. Lighter than Puppeteer when using playwright-core
 * with a system browser. The browser will open the challenge URL and cookies are written to the jar.
 */
function createPlaywrightOrchestrateSolver(options) {
    return async (context) => {
        let playwright;
        try {
            const m = await Promise.resolve().then(() => __importStar(require("playwright")));
            playwright = (m.default ?? m);
        }
        catch {
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
        }
        finally {
            await browser.close();
        }
    };
}
let defaultOrchestrateSolver = null;
/**
 * Returns a solver that tries, in order: FlareSolverr (if FLARESOLVERR_URL is set),
 * then Puppeteer, then Playwright. Puppeteer and Playwright are optional; install one
 * if you don't use FlareSolverr. If none are available, the solver throws when used.
 */
function createDefaultOrchestrateSolver(options) {
    return async (context) => {
        if (defaultOrchestrateSolver) {
            return defaultOrchestrateSolver(context);
        }
        const flaresolverrUrl = typeof process !== "undefined" && process.env && process.env.FLARESOLVERR_URL;
        if (flaresolverrUrl && flaresolverrUrl.trim()) {
            try {
                const solver = createFlareSolverrOrchestrateSolver(flaresolverrUrl.trim());
                await solver(context);
                defaultOrchestrateSolver = solver;
                return;
            }
            catch (e0) {
                // Fall through to Puppeteer/Playwright
            }
        }
        try {
            const solver = createPuppeteerOrchestrateSolver(options);
            await solver(context);
            defaultOrchestrateSolver = solver;
        }
        catch (e1) {
            try {
                const solver = createPlaywrightOrchestrateSolver(options);
                await solver(context);
                defaultOrchestrateSolver = solver;
            }
            catch (e2) {
                const inner = e2 instanceof Error ? e2.message : String(e2);
                // Only treat as "no browser" when package or executable is missing; rethrow timeouts/network errors
                const isMissingBrowser = /Cannot find module|Module not found|playwright.*not found/i.test(inner) ||
                    (inner.includes("Executable") && inner.includes("does not exist")) ||
                    /browser.*not found|could not find.*browser/i.test(inner);
                if (!isMissingBrowser) {
                    throw e2;
                }
                const hint = /Executable|browser/i.test(inner)
                    ? " Run: npx playwright install chromium"
                    : "";
                throw new Error("No headless browser available. Install one of: npm install puppeteer  OR  npm install playwright." +
                    hint +
                    (inner ? " (" + inner + ")" : ""), { cause: e2 });
            }
        }
    };
}
exports.default = request;
