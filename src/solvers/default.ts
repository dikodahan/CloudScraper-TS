import { log } from "../lib/logger";
import { OrchestrateChallengeContext, OrchestrateSolverFn, SolverOptions, SolverResult } from "../lib/solver-types";
import { createPatchrightOrchestrateSolver, createPlaywrightOrchestrateSolver } from "./chromium";
import { createFlareSolverrOrchestrateSolver } from "./flaresolverr";
import { createBrowserlessOrchestrateSolver, createPuppeteerOrchestrateSolver } from "./puppeteer";

const solverCache = new Map<string, OrchestrateSolverFn>();

function cacheKey(options?: SolverOptions): string {
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

function isMissingEngine(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /Cannot find module|Module not found|not found/i.test(msg) || (msg.includes("Executable") && msg.includes("does not exist")) || /browser.*not found|could not find.*browser/i.test(msg);
}

/**
 * Tries, in order: patchright → FLARESOLVERR_URL → BROWSERLESS_WS_ENDPOINT → playwright → puppeteer.
 */
export function createDefaultOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn {
    const key = cacheKey(options);
    return async (context: OrchestrateChallengeContext): Promise<SolverResult | void> => {
        if (options?.debugDir && !context.debugDir) context.debugDir = options.debugDir;
        if (options?.logger && !context.logger) context.logger = options.logger;
        const cached = solverCache.get(key);
        if (cached) return cached(context);

        const trySolver = async (solver: OrchestrateSolverFn, label: string, cacheOnSuccess: boolean): Promise<SolverResult | void | undefined> => {
            try {
                const result = await solver(context);
                if (cacheOnSuccess) solverCache.set(key, solver);
                return result;
            } catch (err) {
                if (!isMissingEngine(err)) throw err;
                log(context.logger, "warn", label + " unavailable, falling through", { error: err instanceof Error ? err.message : String(err) });
                return undefined;
            }
        };

        const patchright = await trySolver(createPatchrightOrchestrateSolver(options), "patchright", true);
        if (patchright !== undefined) return patchright;

        const hasProcess = typeof process !== "undefined" && process.env;
        if (hasProcess) {
            const flaresolverrUrl = process.env.FLARESOLVERR_URL;
            if (flaresolverrUrl && flaresolverrUrl.trim()) {
                try {
                    const solver = createFlareSolverrOrchestrateSolver(flaresolverrUrl.trim(), options);
                    const result = await solver(context);
                    solverCache.set(key, solver);
                    return result;
                } catch (err) {
                    log(context.logger, "warn", "FlareSolverr solver failed, falling through", { error: err instanceof Error ? err.message : String(err) });
                }
            }
            const browserlessWs = process.env.BROWSERLESS_WS_ENDPOINT;
            if (browserlessWs && browserlessWs.trim()) {
                try {
                    const solver = createBrowserlessOrchestrateSolver(browserlessWs.trim(), options);
                    const result = await solver(context);
                    solverCache.set(key, solver);
                    return result;
                } catch (err) {
                    log(context.logger, "warn", "Browserless solver failed, falling through", { error: err instanceof Error ? err.message : String(err) });
                }
            }
        }

        const playwright = await trySolver(createPlaywrightOrchestrateSolver(options), "Playwright", true);
        if (playwright !== undefined) return playwright;

        try {
            const solver = createPuppeteerOrchestrateSolver(options);
            const result = await solver(context);
            solverCache.set(key, solver);
            return result;
        } catch (e2) {
            if (!isMissingEngine(e2)) throw e2;
            const inner = e2 instanceof Error ? e2.message : String(e2);
            const hint = /Executable|browser/i.test(inner) ? " Run: pnpm exec patchright install chromium" : "";
            throw new Error("No headless browser available. Install patchright (pnpm add patchright && pnpm exec patchright install chromium) or another solver backend." + hint + (inner ? " (" + inner + ")" : ""), { cause: e2 });
        }
    };
}
