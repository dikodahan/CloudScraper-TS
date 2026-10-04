export interface DetectHeaders {
    headers: Record<string, string | string[] | undefined>;
    statusCode?: number;
}
export declare const ACCESS_DENIED_TITLES: string[];
export declare const ACCESS_DENIED_SELECTORS: string[];
export declare function isAccessDeniedPage(body: string): boolean;
/** Whether the response should enter challenge handling (not gated on server: cloudflare). */
export declare function shouldHandleChallenge(response: DetectHeaders, body: string): boolean;
export declare function isOrchestrateChallenge(response: DetectHeaders, body: string): boolean;
export declare function isSucuriRedirect(body: string): boolean;
/** Extract a Set-Cookie-shaped assignment from Sucuri's base64 blob without eval. */
export declare function extractSucuriCookie(body: string): string | null;
