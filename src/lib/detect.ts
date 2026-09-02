import { caseless } from "./caseless";

export interface DetectHeaders {
    headers: Record<string, string | string[] | undefined>;
    statusCode?: number;
}

export const ACCESS_DENIED_TITLES = ["Access denied", "Attention Required! | Cloudflare", "Sorry, you have been blocked"];

export const ACCESS_DENIED_SELECTORS = ["div.cf-error-title span.cf-code-label span", "#cf-error-details div.cf-error-overview h1"];

export function isAccessDeniedPage(body: string): boolean {
    if (/<\w+\s+class="cf-error-code">/i.test(body)) return true;
    if (/id=["']cf-error-details["'][\s\S]*cf-error-overview/i.test(body)) return true;
    if (/class=["'][^"']*cf-error-title[\s\S]*cf-code-label/i.test(body)) return true;
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleText = title ? title[1].replace(/\s+/g, " ").trim() : "";
    if (ACCESS_DENIED_TITLES.some((t) => titleText.indexOf(t) !== -1)) return true;
    return /Sorry, you have been blocked/i.test(body);
}

/** Whether the response should enter challenge handling (not gated on server: cloudflare). */
export function shouldHandleChallenge(response: DetectHeaders, body: string): boolean {
    const h = caseless(response.headers);
    if (h["cf-mitigated"] === "challenge") return true;
    if (/ddos-guard/i.test(String(h.server ?? ""))) return true;
    if (/^(cloudflare|sucuri)/i.test(String(h.server ?? ""))) return true;
    const html = /text\/html/i.test(String(h["content-type"] ?? ""));
    const status = response.statusCode ?? 0;
    if (html && (status === 403 || status === 503)) return true;
    if (body.indexOf("_cf_chl_opt") !== -1 || body.indexOf("cdn-cgi/challenge-platform") !== -1) return true;
    return false;
}

export function isOrchestrateChallenge(response: DetectHeaders, body: string): boolean {
    if (isAccessDeniedPage(body)) return false;
    const h = caseless(response.headers);
    const hasJustAMoment = body.indexOf("Just a moment") !== -1 || /<title[^>]*>[\s\S]*Just a moment[\s\S]*<\/title>/i.test(body);
    const hasOrchestrate = body.indexOf("_cf_chl_opt") !== -1 || body.indexOf("challenge-platform") !== -1 || body.indexOf("cdn-cgi/challenge-platform") !== -1;
    const hasCfMitigated = h["cf-mitigated"] === "challenge";
    const hasDdosGuard = /ddos-guard/i.test(String(h.server ?? "")) || /<title[^>]*>[\s\S]*DDoS-Guard[\s\S]*<\/title>/i.test(body);
    const hasOldIuam = body.indexOf("a = document.getElementById('jschl-answer');") !== -1;
    return !hasOldIuam && (hasCfMitigated || hasOrchestrate || hasDdosGuard || (hasJustAMoment && hasOrchestrate));
}

export function isSucuriRedirect(body: string): boolean {
    return body.indexOf("You are being redirected") !== -1 || body.indexOf("sucuri_cloudproxy_js") !== -1;
}

/** Extract a Set-Cookie-shaped assignment from Sucuri's base64 blob without eval. */
export function extractSucuriCookie(body: string): string | null {
    const match = body.match(/S='([^']+)'/);
    if (!match) return null;
    let decoded: string;
    try {
        decoded = Buffer.from(match[1], "base64").toString("utf8");
    } catch {
        return null;
    }
    const cookie = decoded.match(/document\.cookie\s*=\s*["']([^"']+)["']/i);
    return cookie ? cookie[1] : null;
}
