import { CookieJar } from "tough-cookie";
import { CookieForJar } from "./solver-types";

export async function setCookiesOnJar(cookieJar: CookieJar, url: string, cookies: Array<CookieForJar>): Promise<void> {
    const rejections: string[] = [];
    let clearanceSet = false;
    for (const c of cookies) {
        const parts = [`${c.name}=${c.value}`];
        if (c.domain) parts.push(`Domain=${c.domain}`);
        if (c.path) parts.push(`Path=${c.path}`);
        const expiresAt = c.expires ?? c.expiry;
        if (typeof expiresAt === "number" && expiresAt > 0) {
            parts.push(`Expires=${new Date(expiresAt * 1000).toUTCString()}`);
        }
        if (c.httpOnly) parts.push("HttpOnly");
        if (c.secure) parts.push("Secure");
        if (c.sameSite) parts.push(`SameSite=${c.sameSite}`);
        try {
            await cookieJar.setCookie(parts.join("; "), url);
            if (c.name === "cf_clearance") clearanceSet = true;
        } catch (err) {
            rejections.push(c.name + ": " + (err instanceof Error ? err.message : String(err)));
        }
    }
    if (!clearanceSet) {
        throw new Error("Solver did not set cf_clearance" + (rejections.length ? " (" + rejections.join("; ") + ")" : ""));
    }
}
