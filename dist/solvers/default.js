"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultOrchestrateSolver = createDefaultOrchestrateSolver;
const logger_1 = require("../lib/logger");
const chromium_1 = require("./chromium");
const flaresolverr_1 = require("./flaresolverr");
const puppeteer_1 = require("./puppeteer");
const solverCache = new Map();
function cacheKey(options) {
    return JSON.stringify({
        headless: options?.headless,
        timeout: options?.timeout,
        proxy: options?.proxy,
        impersonate: options?.impersonate,
        tabsTillVerify: options?.tabsTillVerify,
        disableMedia: options?.disableMedia,
        sessionTtlMs: options?.sessionTtlMs,
        concurrency: options?.concurrency,
        session: options?.session,
        sessionTtlMinutes: options?.sessionTtlMinutes,
        returnOnlyCookies: options?.returnOnlyCookies,
        maxTimeout: options?.maxTimeout,
        waitInSeconds: options?.waitInSeconds,
    });
}
function isMissingEngine(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /Cannot find module|Module not found|not found/i.test(msg) || (msg.includes("Executable") && msg.includes("does not exist")) || /browser.*not found|could not find.*browser/i.test(msg);
}
/**
 * Tries, in order: patchright → FLARESOLVERR_URL → BROWSERLESS_WS_ENDPOINT → playwright → puppeteer.
 */
function createDefaultOrchestrateSolver(options) {
    const key = cacheKey(options);
    return async (context) => {
        if (options?.debugDir && !context.debugDir)
            context.debugDir = options.debugDir;
        if (options?.logger && !context.logger)
            context.logger = options.logger;
        const cached = solverCache.get(key);
        if (cached)
            return cached(context);
        const trySolver = async (solver, label, cacheOnSuccess) => {
            try {
                const result = await solver(context);
                if (cacheOnSuccess)
                    solverCache.set(key, solver);
                return result;
            }
            catch (err) {
                if (!isMissingEngine(err))
                    throw err;
                (0, logger_1.log)(context.logger, "warn", label + " unavailable, falling through", { error: err instanceof Error ? err.message : String(err) });
                return undefined;
            }
        };
        const patchright = await trySolver((0, chromium_1.createPatchrightOrchestrateSolver)(options), "patchright", true);
        if (patchright !== undefined)
            return patchright;
        const hasProcess = typeof process !== "undefined" && process.env;
        if (hasProcess) {
            const flaresolverrUrl = process.env.FLARESOLVERR_URL;
            if (flaresolverrUrl && flaresolverrUrl.trim()) {
                try {
                    const solver = (0, flaresolverr_1.createFlareSolverrOrchestrateSolver)(flaresolverrUrl.trim(), options);
                    const result = await solver(context);
                    solverCache.set(key, solver);
                    return result;
                }
                catch (err) {
                    (0, logger_1.log)(context.logger, "warn", "FlareSolverr solver failed, falling through", { error: err instanceof Error ? err.message : String(err) });
                }
            }
            const browserlessWs = process.env.BROWSERLESS_WS_ENDPOINT;
            if (browserlessWs && browserlessWs.trim()) {
                try {
                    const solver = (0, puppeteer_1.createBrowserlessOrchestrateSolver)(browserlessWs.trim(), options);
                    const result = await solver(context);
                    solverCache.set(key, solver);
                    return result;
                }
                catch (err) {
                    (0, logger_1.log)(context.logger, "warn", "Browserless solver failed, falling through", { error: err instanceof Error ? err.message : String(err) });
                }
            }
        }
        const playwright = await trySolver((0, chromium_1.createPlaywrightOrchestrateSolver)(options), "Playwright", true);
        if (playwright !== undefined)
            return playwright;
        try {
            const solver = (0, puppeteer_1.createPuppeteerOrchestrateSolver)(options);
            const result = await solver(context);
            solverCache.set(key, solver);
            return result;
        }
        catch (e2) {
            if (!isMissingEngine(e2))
                throw e2;
            const inner = e2 instanceof Error ? e2.message : String(e2);
            const hint = /Executable|browser/i.test(inner) ? " Run: pnpm exec patchright install chromium" : "";
            throw new Error("No headless browser available. Install patchright (pnpm add patchright && pnpm exec patchright install chromium) or another solver backend." + hint + (inner ? " (" + inner + ")" : ""), { cause: e2 });
        }
    };
}
