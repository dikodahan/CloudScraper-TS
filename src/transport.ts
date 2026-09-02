export interface TransportRequestOpts {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    followRedirect?: boolean;
    searchParams?: Record<string, string>;
    form?: Record<string, string>;
    json?: unknown;
    timeout?: number;
    retry?: number;
}

export interface TransportResponse {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: Buffer;
    url: string;
}

export interface Transport {
    request(url: string, opts: TransportRequestOpts): Promise<TransportResponse>;
}

export interface RequesterResponse {
    url: string;
    headers: Record<string, string | string[] | undefined>;
    statusCode: number;
    body: Buffer | Uint8Array | string;
}

export type Requester = (url: string, options?: Record<string, unknown>) => Promise<RequesterResponse>;

export interface TransportParams {
    requester?: Requester;
    impersonate?: string;
    proxy?: string;
    timeout?: number;
    followRedirect?: boolean;
}

export function encodeBody(opts: TransportRequestOpts): { body?: string; headers: Record<string, string> } {
    const headers = { ...(opts.headers || {}) };
    if (opts.json !== undefined) {
        if (!headers["content-type"]) headers["content-type"] = "application/json";
        return { body: JSON.stringify(opts.json), headers };
    }
    if (opts.form && Object.keys(opts.form).length > 0) {
        if (!headers["content-type"]) headers["content-type"] = "application/x-www-form-urlencoded";
        return { body: new URLSearchParams(opts.form).toString(), headers };
    }
    if (opts.body != null) {
        return { body: typeof opts.body === "string" ? opts.body : opts.body.toString("utf8"), headers };
    }
    return { headers };
}

export function withSearchParams(url: string, searchParams?: Record<string, string>): string {
    if (!searchParams || Object.keys(searchParams).length === 0) return url;
    const u = new URL(url);
    for (const [k, v] of Object.entries(searchParams)) {
        u.searchParams.set(k, v);
    }
    return u.href;
}

export function headersToObject(headers: { forEach(cb: (value: string, key: string) => void): void } | Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
    if (headers && typeof (headers as { forEach?: unknown }).forEach === "function") {
        const out: Record<string, string> = {};
        (headers as { forEach(cb: (value: string, key: string) => void): void }).forEach((value, key) => {
            out[key] = value;
        });
        return out;
    }
    return { ...(headers as Record<string, string | string[] | undefined>) };
}
