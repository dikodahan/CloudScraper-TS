import { CookieJar } from "tough-cookie";
import { Transport, TransportParams } from "../transport";
export declare function resolveTransport(params: TransportParams, cookieJar: CookieJar): Promise<Transport>;
