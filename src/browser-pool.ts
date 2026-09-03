import { existsSync } from "fs";

export interface PooledBrowser {
    newContext(opts?: Record<string, unknown>): Promise<PooledContext>;
    close(): Promise<void>;
}

export interface PooledContext {
    newPage(): Promise<PooledPage>;
    cookies(urls?: string | string[]): Promise<Array<{ name: string; value: string; domain?: string; path?: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string }>>;
    close(): Promise<void>;
}

export interface PooledPage {
    close(): Promise<void>;
    [key: string]: unknown;
}

export interface PlaywrightLike {
    chromium: {
        launch(opts?: Record<string, unknown>): Promise<PooledBrowser>;
    };
}

export interface PoolOptions {
    engine: string;
    proxy?: string;
    impersonate?: string;
    headless?: boolean;
    sessionTtlMs?: number;
    concurrency?: number;
}

interface PoolEntry {
    browser: PooledBrowser;
    context: PooledContext;
    lastUsed: number;
    ttl: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const pools = new Map<string, PoolEntry>();

let maxConcurrent = 2;
let active = 0;
const waiters: Array<() => void> = [];

export function setMaxConcurrentSolves(n: number): void {
    maxConcurrent = Math.max(1, Math.floor(n));
}

async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
        active++;
        return;
    }
    await new Promise<void>((resolve) => {
        waiters.push(resolve);
    });
}

function release(): void {
    const next = waiters.shift();
    if (next) next();
    else active--;
}

function poolKey(opts: PoolOptions): string {
    return [opts.engine, opts.proxy ?? "", opts.impersonate ?? "", String(opts.headless !== false)].join("|");
}

function browserProxy(proxy: string): Record<string, string> {
    try {
        const parsed = new URL(proxy);
        const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
        return {
            server,
            ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
            ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        };
    } catch {
        return { server: proxy };
    }
}

function systemChromiumPath(): string | undefined {
    const candidates = [
        process.env.CLOUDSCRAPER_CHROMIUM_EXECUTABLE_PATH,
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ];
    return candidates.find((candidate): candidate is string => !!candidate && existsSync(candidate));
}

async function destroyEntry(key: string, entry: PoolEntry): Promise<void> {
    pools.delete(key);
    await entry.context.close().catch(() => undefined);
    await entry.browser.close().catch(() => undefined);
}

export async function closeBrowserPool(): Promise<void> {
    const entries = [...pools.entries()];
    pools.clear();
    await Promise.all(entries.map(([, entry]) => Promise.all([entry.context.close().catch(() => undefined), entry.browser.close().catch(() => undefined)])));
}

async function getOrCreate(lib: PlaywrightLike, opts: PoolOptions): Promise<PoolEntry> {
    const key = poolKey(opts);
    const ttl = opts.sessionTtlMs ?? DEFAULT_TTL_MS;
    const existing = pools.get(key);
    if (existing) {
        if (Date.now() - existing.lastUsed > existing.ttl) {
            await destroyEntry(key, existing);
        } else {
            existing.lastUsed = Date.now();
            return existing;
        }
    }

    const launchOpts: Record<string, unknown> = {
        headless: opts.headless !== false,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };
    const executablePath = systemChromiumPath();
    if (executablePath) {
        launchOpts.executablePath = executablePath;
    }
    if (opts.proxy) {
        launchOpts.proxy = browserProxy(opts.proxy);
    }
    const browser = await lib.chromium.launch(launchOpts);
    const context = await browser.newContext();
    const entry: PoolEntry = { browser, context, lastUsed: Date.now(), ttl };
    pools.set(key, entry);
    return entry;
}

export async function withPooledPage<T>(lib: PlaywrightLike, opts: PoolOptions, fn: (page: PooledPage, context: PooledContext) => Promise<T>): Promise<T> {
    if (typeof opts.concurrency === "number" && opts.concurrency > 0) {
        setMaxConcurrentSolves(opts.concurrency);
    }
    await acquire();
    try {
        const entry = await getOrCreate(lib, opts);
        const page = await entry.context.newPage();
        try {
            return await fn(page, entry.context);
        } finally {
            await page.close().catch(() => undefined);
        }
    } finally {
        release();
    }
}
