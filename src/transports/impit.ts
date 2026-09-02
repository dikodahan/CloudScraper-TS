import { CookieJar } from "tough-cookie";
import { DEFAULT_HEADERS } from "../lib/caseless";
import { importOptional } from "../lib/optional-import";
import { encodeBody, headersToObject, Transport, TransportParams, TransportRequestOpts, TransportResponse, withSearchParams } from "../transport";

interface ImpitLike {
    fetch(
        resource: string,
        init?: Record<string, unknown>,
    ): Promise<{
        status: number;
        url: string;
        headers: { forEach(cb: (value: string, key: string) => void): void };
        arrayBuffer(): Promise<ArrayBuffer>;
    }>;
}

type ImpitCtor = new (options?: Record<string, unknown>) => ImpitLike;

function stripDefaultFingerprintHeaders(headers: Record<string, string>): Record<string, string> {
    const out = { ...headers };
    const defaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
        defaults[k.toLowerCase()] = v;
    }
    for (const key of ["user-agent", "accept", "accept-language"]) {
        if (out[key] && defaults[key] && out[key] === defaults[key]) {
            delete out[key];
        }
    }
    delete out["accept-encoding"];
    return out;
}

export async function createImpitTransport(params: TransportParams, cookieJar: CookieJar): Promise<Transport> {
    const m = (await importOptional("impit")) as { Impit?: ImpitCtor };
    const Impit = m.Impit;
    if (!Impit) {
        throw new Error("impit not found. Install with: pnpm add impit");
    }

    const client = new Impit({
        browser: params.impersonate ?? "chrome",
        cookieJar,
        proxyUrl: params.proxy,
        followRedirects: params.followRedirect !== false,
        maxRedirects: 10,
        timeout: params.timeout,
        http3: false,
    });

    return {
        async request(url: string, opts: TransportRequestOpts): Promise<TransportResponse> {
            const encoded = encodeBody(opts);
            const headers = stripDefaultFingerprintHeaders(encoded.headers);
            const res = await client.fetch(withSearchParams(url, opts.searchParams), {
                method: (opts.method ?? "GET").toUpperCase(),
                headers,
                body: encoded.body,
                timeout: opts.timeout,
                redirect: opts.followRedirect === false ? "manual" : "follow",
            });
            return {
                status: res.status,
                headers: headersToObject(res.headers),
                body: Buffer.from(await res.arrayBuffer()),
                url: res.url,
            };
        },
    };
}

export function isImpitUnavailable(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /Cannot find module|Module not found|impit not found|Could not locate|ERR_DLOPEN|dlopen|failed to load/i.test(msg);
}
