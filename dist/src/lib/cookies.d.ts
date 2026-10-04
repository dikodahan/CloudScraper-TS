import { CookieJar } from "tough-cookie";
import { CookieForJar } from "./solver-types";
export declare function setCookiesOnJar(cookieJar: CookieJar, url: string, cookies: Array<CookieForJar>, options?: {
    requireClearance?: boolean;
}): Promise<void>;
