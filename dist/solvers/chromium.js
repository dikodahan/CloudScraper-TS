"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPatchrightOrchestrateSolver = createPatchrightOrchestrateSolver;
exports.createPlaywrightOrchestrateSolver = createPlaywrightOrchestrateSolver;
const errors_1 = require("../errors");
const browser_pool_1 = require("../browser-pool");
const cookies_1 = require("../lib/cookies");
const optional_import_1 = require("../lib/optional-import");
const challenge_wait_1 = require("./challenge-wait");
const dump_page_1 = require("./dump-page");
function applySolverContext(context, options) {
    if (!context.debugDir && options?.debugDir)
        context.debugDir = options.debugDir;
    if (!context.logger && options?.logger)
        context.logger = options.logger;
}
function resolveProxy(context, options) {
    return context.proxy ?? options?.proxy;
}
async function loadEngine(id, label) {
    try {
        const m = (await (0, optional_import_1.importOptional)(id));
        const lib = (m.default ?? m);
        if (!lib?.chromium?.launch) {
            throw new Error(label + " not found. Install with: pnpm add " + id);
        }
        return lib;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found/i.test(msg))
            throw err;
        throw new Error(label + " not found. Install with: pnpm add " + id, { cause: err });
    }
}
async function runChromiumSolve(lib, engine, context, options) {
    applySolverContext(context, options);
    const timeout = context.timeout ?? options?.timeout ?? 45000;
    const deadline = Date.now() + timeout;
    const proxy = resolveProxy(context, options);
    return (0, browser_pool_1.withPooledPage)(lib, {
        engine,
        proxy,
        impersonate: context.impersonate ?? options?.impersonate,
        headless: options?.headless,
        sessionTtlMs: options?.sessionTtlMs,
        concurrency: options?.concurrency,
    }, async (rawPage, pooledContext) => {
        const page = rawPage;
        try {
            if (options?.disableMedia !== false) {
                await (0, challenge_wait_1.disableMediaRoutes)(page);
            }
            await page.goto(context.url, {
                waitUntil: "domcontentloaded",
                timeout,
            });
            const tabs = options?.tabsTillVerify ?? 1;
            if (tabs > 0) {
                await (0, challenge_wait_1.clickVerify)(page, tabs);
            }
            await (0, challenge_wait_1.waitForChallengeClear)(page, deadline);
            if (typeof options?.waitInSeconds === "number" && options.waitInSeconds > 0) {
                await new Promise((r) => setTimeout(r, options.waitInSeconds * 1000));
            }
            const cookies = await pooledContext.cookies(context.url);
            const userAgent = await page.evaluate(() => navigator.userAgent);
            const body = await page.content();
            const result = {
                cookies,
                userAgent,
                body,
                status: 200,
                url: typeof page.url === "function" ? page.url() : context.url,
            };
            await (0, cookies_1.setCookiesOnJar)(context.cookieJar, context.url, cookies);
            return result;
        }
        catch (err) {
            await (0, dump_page_1.dumpBrowserPage)(context, page, err);
            if (err instanceof challenge_wait_1.ChallengeBlockedError) {
                throw new errors_1.AccessDeniedError(undefined, context.response);
            }
            throw err;
        }
    });
}
function createPatchrightOrchestrateSolver(options) {
    return async (context) => {
        const lib = await loadEngine("patchright", "patchright");
        return runChromiumSolve(lib, "patchright", context, options);
    };
}
function createPlaywrightOrchestrateSolver(options) {
    return async (context) => {
        const lib = await loadEngine("playwright", "Playwright");
        return runChromiumSolve(lib, "playwright", context, options);
    };
}
