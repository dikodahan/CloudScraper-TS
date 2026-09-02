import { CookieJar } from "tough-cookie";
import { Transport, TransportParams } from "../transport";
import { createGotTransport, wrapRequester } from "./got";
import { createImpitTransport, isImpitUnavailable } from "./impit";

const sessionCache = new WeakMap<CookieJar, Map<string, Transport>>();

function sessionKey(params: TransportParams): string {
    return `${params.impersonate ?? "chrome"}|${params.proxy ?? ""}|${params.timeout ?? ""}|${params.followRedirect !== false}`;
}

export async function resolveTransport(params: TransportParams, cookieJar: CookieJar): Promise<Transport> {
    if (params.requester) {
        return wrapRequester(params.requester, cookieJar);
    }

    const key = sessionKey(params);
    let byKey = sessionCache.get(cookieJar);
    if (!byKey) {
        byKey = new Map();
        sessionCache.set(cookieJar, byKey);
    }
    const cached = byKey.get(key);
    if (cached) return cached;

    let transport: Transport;
    try {
        transport = await createImpitTransport(params, cookieJar);
    } catch (err) {
        if (!isImpitUnavailable(err)) throw err;
        transport = await createGotTransport(cookieJar);
    }
    byKey.set(key, transport);
    return transport;
}
