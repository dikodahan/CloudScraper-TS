import { CookieJar } from "tough-cookie";
import { Requester, Transport, TransportParams } from "../transport";
export declare function wrapRequester(requester: Requester, cookieJar?: CookieJar, defaults?: Record<string, unknown>): Transport;
/**
 * got@16 fallback transport. Uses built-in HTTP/2 when there is no proxy.
 * HTTP(S) proxies use hpagent over HTTP/1.1 (got@16 removed HTTP/2 proxy support).
 * SOCKS proxies are not supported here — use impit.
 */
export declare function createGotTransport(cookieJar: CookieJar, params?: TransportParams): Promise<Transport>;
