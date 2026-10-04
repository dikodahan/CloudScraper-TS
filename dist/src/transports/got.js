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
function wrapRequester(requester, cookieJar) {
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
                strictContentLength: false,
                form: opts.form,
                json: opts.json,
                searchParams: opts.searchParams,
                body: opts.body,
                timeout: opts.timeout ? { request: opts.timeout } : undefined,
                retry: { limit: typeof opts.retry === "number" && opts.retry >= 0 ? opts.retry : 0 },
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
async function createGotTransport(cookieJar) {
    const m = (await (0, optional_import_1.importOptional)("got"));
    const got = (m.default ?? m);
    return wrapRequester(got, cookieJar);
}
