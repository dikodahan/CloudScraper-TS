import { CookieJar } from "tough-cookie";
import { Requester, Transport } from "../transport";
export declare function wrapRequester(requester: Requester, cookieJar?: CookieJar): Transport;
export declare function createGotTransport(cookieJar: CookieJar): Promise<Transport>;
