import { CookieJar } from "tough-cookie";
import { importOptional } from "../lib/optional-import";
import { Requester, Transport, TransportRequestOpts, TransportResponse } from "../transport";

function toBuffer(body: Buffer | Uint8Array | string): Buffer {
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    return Buffer.from(String(body));
}

export function wrapRequester(requester: Requester, cookieJar?: CookieJar): Transport {
    return {
        async request(url: string, opts: TransportRequestOpts): Promise<TransportResponse> {
            const res = await requester(url, {
                method: opts.method ?? "GET",
                headers: opts.headers,
                cookieJar,
                followRedirect: opts.followRedirect !== false,
                decompress: true,
                responseType: "buffer",
                throwHttpErrors: false,
                strictContentLength: false,
                form: opts.form,
                json: opts.json,
                searchParams: opts.searchParams,
                body: opts.body,
                timeout: opts.timeout ? { request: opts.timeout } : undefined,
                retry: { limit: typeof opts.retry === "number" && opts.retry >= 0 ? opts.retry : 0 },
            });
            return {
                status: res.statusCode,
                headers: res.headers,
                body: toBuffer(res.body),
                url: res.url,
            };
        },
    };
}

export async function createGotTransport(cookieJar: CookieJar): Promise<Transport> {
    const m = (await importOptional("got")) as { default?: Requester };
    const got = (m.default ?? m) as Requester;
    return wrapRequester(got, cookieJar);
}
