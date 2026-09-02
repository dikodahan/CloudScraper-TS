import { Cookie } from "tough-cookie";
import { DEFAULT_HEADERS } from "../lib/caseless";
import { setCookiesOnJar } from "../lib/cookies";
import { CookieForJar, OrchestrateChallengeContext, OrchestrateSolverFn, SolverOptions, SolverResult } from "../lib/solver-types";
import { FlareSolverrError } from "../errors";

const DEFAULT_SESSION = "cloudscraper-ts";
const createdSessions = new Set<string>();

interface FlareSolution {
    cookies?: Array<CookieForJar>;
    userAgent?: string;
    response?: string;
    status?: number;
    url?: string;
    headers?: Record<string, string>;
    screenshot?: string;
    turnstile_token?: string;
}

interface FlareResponse {
    status?: string;
    message?: string;
    session?: string;
    solution?: FlareSolution;
}

export interface FlareProxy {
    url: string;
    username?: string;
    password?: string;
}

function sessionCacheKey(endpoint: string, session: string, proxy?: string): string {
    return endpoint + "\0" + session + "\0" + (proxy ?? "");
}

function ttlMinutes(options?: SolverOptions): number {
    if (typeof options?.sessionTtlMinutes === "number" && options.sessionTtlMinutes > 0) {
        return Math.floor(options.sessionTtlMinutes);
    }
    const ms = options?.sessionTtlMs ?? 5 * 60 * 1000;
    if (typeof ms === "number" && ms > 0) return Math.max(1, Math.ceil(ms / 60000));
    return 5;
}

/** Split `user:pass@host` for FlareSolverr `sessions.create` (auth is supported there, not on per-request proxy). */
export function parseFlareProxy(proxy?: string): FlareProxy | undefined {
    if (!proxy || !proxy.trim()) return undefined;
    try {
        const u = new URL(proxy.trim());
        const username = u.username ? decodeURIComponent(u.username) : undefined;
        const password = u.password ? decodeURIComponent(u.password) : undefined;
        if (!username && !password) {
            return { url: proxy.trim() };
        }
        u.username = "";
        u.password = "";
        const out: FlareProxy = { url: u.href };
        if (username) out.username = username;
        if (password) out.password = password;
        return out;
    } catch {
        return { url: proxy.trim() };
    }
}

function requestProxy(proxy?: string): { url: string } | undefined {
    const parsed = parseFlareProxy(proxy);
    if (!parsed) return undefined;
    return { url: parsed.url };
}

async function cookiesFromJar(context: OrchestrateChallengeContext): Promise<Array<{ name: string; value: string }> | undefined> {
    try {
        const list = await context.cookieJar.getCookies(context.url);
        if (!list.length) return undefined;
        return list.map((c: Cookie) => ({ name: c.key, value: c.value }));
    } catch {
        return undefined;
    }
}

async function flareRpc(endpoint: string, payload: Record<string, unknown>): Promise<FlareResponse> {
    let res: Response;
    try {
        res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        throw new FlareSolverrError(err instanceof Error ? err : new Error(String(err)));
    }
    let data: FlareResponse;
    try {
        data = (await res.json()) as FlareResponse;
    } catch {
        throw new FlareSolverrError(res.statusText || "FlareSolverr returned non-JSON");
    }
    return data;
}

function throwIfError(data: FlareResponse): void {
    if (data.status === "ok") return;
    const err = new FlareSolverrError(data.message || "FlareSolverr request failed");
    if (data.solution?.screenshot) err.screenshot = data.solution.screenshot;
    throw err;
}

async function ensureSession(endpoint: string, session: string, proxy?: string): Promise<string> {
    const key = sessionCacheKey(endpoint, session, proxy);
    if (createdSessions.has(key)) return session;
    const payload: Record<string, unknown> = { cmd: "sessions.create", session };
    const proxyObj = parseFlareProxy(proxy);
    if (proxyObj) payload.proxy = proxyObj;
    const data = await flareRpc(endpoint, payload);
    if (data.status === "ok" || /already exists/i.test(data.message || "")) {
        createdSessions.add(key);
        return data.session || session;
    }
    throwIfError(data);
    createdSessions.add(key);
    return data.session || session;
}

export async function destroyFlareSolverrSession(baseUrl: string, session: string = DEFAULT_SESSION): Promise<void> {
    const endpoint = baseUrl.replace(/\/$/, "");
    const data = await flareRpc(endpoint, { cmd: "sessions.destroy", session });
    throwIfError(data);
    for (const key of [...createdSessions]) {
        if (key.startsWith(endpoint + "\0" + session + "\0")) createdSessions.delete(key);
    }
}

export function createFlareSolverrOrchestrateSolver(baseUrl: string, options?: SolverOptions): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<SolverResult> => {
        const endpoint = baseUrl.replace(/\/$/, "");
        const method = String(context.method ?? "GET").toUpperCase();
        const isGet = method === "GET" || method === "HEAD";
        const proxy = context.proxy ?? options?.proxy;
        const useSession = options?.session !== false;
        const sessionName = typeof options?.session === "string" && options.session.trim() ? options.session.trim() : DEFAULT_SESSION;
        const session = useSession ? await ensureSession(endpoint, sessionName, proxy) : undefined;
        const returnOnlyCookies = options?.returnOnlyCookies ?? !isGet;
        const maxTimeout = options?.maxTimeout ?? context.timeout ?? options?.timeout ?? 60000;
        const wantScreenshot = !!(context.debugDir || options?.debugDir);

        const payload: Record<string, unknown> = {
            cmd: isGet || !context.postData ? "request.get" : "request.post",
            url: context.url,
            maxTimeout,
        };
        if (payload.cmd === "request.post") {
            payload.postData = context.postData;
        }
        if (session) {
            payload.session = session;
            payload.session_ttl_minutes = ttlMinutes(options);
        } else {
            const proxyObj = requestProxy(proxy);
            if (proxyObj) payload.proxy = proxyObj;
        }
        if (returnOnlyCookies) payload.returnOnlyCookies = true;
        if (wantScreenshot) payload.returnScreenshot = true;
        if (options?.disableMedia !== false) payload.disableMedia = true;
        if (isGet && (options?.tabsTillVerify ?? 1) > 0) {
            payload.tabs_till_verify = options?.tabsTillVerify ?? 1;
        }
        if (typeof options?.waitInSeconds === "number" && options.waitInSeconds > 0) {
            payload.waitInSeconds = options.waitInSeconds;
        }
        const jarCookies = await cookiesFromJar(context);
        if (jarCookies) payload.cookies = jarCookies;

        const data = await flareRpc(endpoint, payload);
        throwIfError(data);
        if (!data.solution?.cookies) {
            throw new FlareSolverrError(data.message || "FlareSolverr returned no cookies");
        }

        const cookies = data.solution.cookies;
        await setCookiesOnJar(context.cookieJar, context.url, cookies);
        const result: SolverResult = {
            cookies,
            userAgent: data.solution.userAgent || DEFAULT_HEADERS["User-Agent"],
            status: data.solution.status,
            url: data.solution.url,
            headers: data.solution.headers,
            turnstileToken: data.solution.turnstile_token,
        };
        if (!returnOnlyCookies && data.solution.response != null) {
            result.body = data.solution.response;
        }
        return result;
    };
}
