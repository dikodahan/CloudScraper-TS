"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTransport = resolveTransport;
const got_1 = require("./got");
const impit_1 = require("./impit");
const sessionCache = new WeakMap();
function sessionKey(params) {
    return `${params.impersonate ?? "chrome"}|${params.proxy ?? ""}|${params.timeout ?? ""}|${params.followRedirect !== false}`;
}
async function resolveTransport(params, cookieJar) {
    if (params.requester) {
        return (0, got_1.wrapRequester)(params.requester, cookieJar);
    }
    const key = sessionKey(params);
    let byKey = sessionCache.get(cookieJar);
    if (!byKey) {
        byKey = new Map();
        sessionCache.set(cookieJar, byKey);
    }
    const cached = byKey.get(key);
    if (cached)
        return cached;
    let transport;
    try {
        transport = await (0, impit_1.createImpitTransport)(params, cookieJar);
    }
    catch (err) {
        if (!(0, impit_1.isImpitUnavailable)(err))
            throw err;
        transport = await (0, got_1.createGotTransport)(cookieJar);
    }
    byKey.set(key, transport);
    return transport;
}
