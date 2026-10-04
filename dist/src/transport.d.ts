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
export declare function encodeBody(opts: TransportRequestOpts): {
    body?: string;
    headers: Record<string, string>;
};
export declare function withSearchParams(url: string, searchParams?: Record<string, string>): string;
export declare function headersToObject(headers: {
    forEach(cb: (value: string, key: string) => void): void;
} | Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined>;
