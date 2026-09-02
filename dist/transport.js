"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeBody = encodeBody;
exports.withSearchParams = withSearchParams;
exports.headersToObject = headersToObject;
function encodeBody(opts) {
    const headers = { ...(opts.headers || {}) };
    if (opts.json !== undefined) {
        if (!headers["content-type"])
            headers["content-type"] = "application/json";
        return { body: JSON.stringify(opts.json), headers };
    }
    if (opts.form && Object.keys(opts.form).length > 0) {
        if (!headers["content-type"])
            headers["content-type"] = "application/x-www-form-urlencoded";
        return { body: new URLSearchParams(opts.form).toString(), headers };
    }
    if (opts.body != null) {
        return { body: typeof opts.body === "string" ? opts.body : opts.body.toString("utf8"), headers };
    }
    return { headers };
}
function withSearchParams(url, searchParams) {
    if (!searchParams || Object.keys(searchParams).length === 0)
        return url;
    const u = new URL(url);
    for (const [k, v] of Object.entries(searchParams)) {
        u.searchParams.set(k, v);
    }
    return u.href;
}
function headersToObject(headers) {
    if (headers && typeof headers.forEach === "function") {
        const out = {};
        headers.forEach((value, key) => {
            out[key] = value;
        });
        return out;
    }
    return { ...headers };
}
