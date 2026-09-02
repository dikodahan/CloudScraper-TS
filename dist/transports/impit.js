"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createImpitTransport = createImpitTransport;
exports.isImpitUnavailable = isImpitUnavailable;
const caseless_1 = require("../lib/caseless");
const optional_import_1 = require("../lib/optional-import");
const transport_1 = require("../transport");
function stripDefaultFingerprintHeaders(headers) {
    const out = { ...headers };
    const defaults = {};
    for (const [k, v] of Object.entries(caseless_1.DEFAULT_HEADERS)) {
        defaults[k.toLowerCase()] = v;
    }
    for (const key of ["user-agent", "accept", "accept-language"]) {
        if (out[key] && defaults[key] && out[key] === defaults[key]) {
            delete out[key];
        }
    }
    delete out["accept-encoding"];
    return out;
}
async function createImpitTransport(params, cookieJar) {
    const m = (await (0, optional_import_1.importOptional)("impit"));
    const Impit = m.Impit;
    if (!Impit) {
        throw new Error("impit not found. Install with: pnpm add impit");
    }
    const client = new Impit({
        browser: params.impersonate ?? "chrome",
        cookieJar,
        proxyUrl: params.proxy,
        followRedirects: params.followRedirect !== false,
        maxRedirects: 10,
        timeout: params.timeout,
        http3: false,
    });
    return {
        async request(url, opts) {
            const encoded = (0, transport_1.encodeBody)(opts);
            const headers = stripDefaultFingerprintHeaders(encoded.headers);
            const res = await client.fetch((0, transport_1.withSearchParams)(url, opts.searchParams), {
                method: (opts.method ?? "GET").toUpperCase(),
                headers,
                body: encoded.body,
                timeout: opts.timeout,
                redirect: opts.followRedirect === false ? "manual" : "follow",
            });
            return {
                status: res.status,
                headers: (0, transport_1.headersToObject)(res.headers),
                body: Buffer.from(await res.arrayBuffer()),
                url: res.url,
            };
        },
    };
}
function isImpitUnavailable(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /Cannot find module|Module not found|impit not found|Could not locate|ERR_DLOPEN|dlopen|failed to load/i.test(msg);
}
