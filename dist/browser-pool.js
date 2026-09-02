"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMaxConcurrentSolves = setMaxConcurrentSolves;
exports.closeBrowserPool = closeBrowserPool;
exports.withPooledPage = withPooledPage;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const pools = new Map();
let maxConcurrent = 2;
let active = 0;
const waiters = [];
function setMaxConcurrentSolves(n) {
    maxConcurrent = Math.max(1, Math.floor(n));
}
async function acquire() {
    if (active < maxConcurrent) {
        active++;
        return;
    }
    await new Promise((resolve) => {
        waiters.push(resolve);
    });
}
function release() {
    const next = waiters.shift();
    if (next)
        next();
    else
        active--;
}
function poolKey(opts) {
    return [opts.engine, opts.proxy ?? "", opts.impersonate ?? "", String(opts.headless !== false)].join("|");
}
async function destroyEntry(key, entry) {
    pools.delete(key);
    await entry.context.close().catch(() => undefined);
    await entry.browser.close().catch(() => undefined);
}
async function closeBrowserPool() {
    const entries = [...pools.entries()];
    pools.clear();
    await Promise.all(entries.map(([, entry]) => Promise.all([entry.context.close().catch(() => undefined), entry.browser.close().catch(() => undefined)])));
}
async function getOrCreate(lib, opts) {
    const key = poolKey(opts);
    const ttl = opts.sessionTtlMs ?? DEFAULT_TTL_MS;
    const existing = pools.get(key);
    if (existing) {
        if (Date.now() - existing.lastUsed > existing.ttl) {
            await destroyEntry(key, existing);
        }
        else {
            existing.lastUsed = Date.now();
            return existing;
        }
    }
    const launchOpts = {
        headless: opts.headless !== false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
    if (opts.proxy) {
        launchOpts.proxy = { server: opts.proxy };
    }
    const browser = await lib.chromium.launch(launchOpts);
    const context = await browser.newContext();
    const entry = { browser, context, lastUsed: Date.now(), ttl };
    pools.set(key, entry);
    return entry;
}
async function withPooledPage(lib, opts, fn) {
    if (typeof opts.concurrency === "number" && opts.concurrency > 0) {
        setMaxConcurrentSolves(opts.concurrency);
    }
    await acquire();
    try {
        const entry = await getOrCreate(lib, opts);
        const page = await entry.context.newPage();
        try {
            return await fn(page, entry.context);
        }
        finally {
            await page.close().catch(() => undefined);
        }
    }
    finally {
        release();
    }
}
