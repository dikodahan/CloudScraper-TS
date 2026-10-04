"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapRequester = wrapRequester;
exports.createGotTransport = createGotTransport;
const optional_import_1 = require("../lib/optional-import");
function toBuffer(body) {
    if (Buffer.isBuffer(body))
        return body;
    if (body instanceof Uint8Array)
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    return Buffer.from(String(body));
}
function isSocksProxy(proxy) {
    return /^socks[45]?h?:\/\//i.test(proxy.trim());
}
async function httpProxyAgents(proxy) {
    const m = (await (0, optional_import_1.importOptional)("hpagent"));
    if (!m.HttpProxyAgent || !m.HttpsProxyAgent) {
        throw new Error("got fallback with an HTTP(S) proxy requires hpagent. Install with: pnpm add hpagent");
    }
    const opts = { proxy, keepAlive: true };
    return {
        http: new m.HttpProxyAgent(opts),
        https: new m.HttpsProxyAgent(opts),
    };
}
function wrapRequester(requester, cookieJar, defaults) {
    return {
        async request(url, opts) {
            const res = await requester(url, {
                method: opts.method ?? "GET",
                headers: opts.headers,
                cookieJar,
                followRedirect: opts.followRedirect !== false,
                decompress: true,
                responseType: "buffer",
                throwHttpErrors: false,
                // Cloudflare challenge bodies can mismatch Content-Length after transforms (got@15+ default is true).
                strictContentLength: false,
                form: opts.form,
                json: opts.json,
                searchParams: opts.searchParams,
                body: opts.body,
                timeout: opts.timeout ? { request: opts.timeout } : undefined,
                retry: { limit: typeof opts.retry === "number" && opts.retry >= 0 ? opts.retry : 0 },
                ...defaults,
            });
            return {
                status: res.statusCode,
                headers: res.headers,
                body: toBuffer(res.body),
                url: res.url,
            };
        },
    };
}
/**
 * got@16 fallback transport. Uses built-in HTTP/2 when there is no proxy.
 * HTTP(S) proxies use hpagent over HTTP/1.1 (got@16 removed HTTP/2 proxy support).
 * SOCKS proxies are not supported here — use impit.
 */
async function createGotTransport(cookieJar, params) {
    const m = (await (0, optional_import_1.importOptional)("got"));
    const got = (m.default ?? m);
    const proxy = params?.proxy?.trim();
    if (proxy && isSocksProxy(proxy)) {
        throw new Error("got fallback does not support SOCKS proxies. Install impit (pnpm add impit) or use an HTTP(S) proxy.");
    }
    const defaults = {};
    if (proxy) {
        const agents = await httpProxyAgents(proxy);
        // Custom https agents force the HTTP/1.1 path; agent.http2 must not be an Agent instance on got@16.
        defaults.http2 = false;
        defaults.agent = { http: agents.http, https: agents.https, http2: false };
    }
    else {
        defaults.http2 = true;
    }
    return wrapRequester(got, cookieJar, defaults);
}
