export function caseless(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    Object.keys(headers).forEach((key) => {
        const value = headers[key];
        if (value === undefined) return;
        result[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
    });
    return result;
}

export const DEFAULT_HEADERS: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
};
