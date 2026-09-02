import { CookieJar } from "tough-cookie";
import { Transport, TransportParams } from "../transport";
export declare function createImpitTransport(params: TransportParams, cookieJar: CookieJar): Promise<Transport>;
export declare function isImpitUnavailable(err: unknown): boolean;
