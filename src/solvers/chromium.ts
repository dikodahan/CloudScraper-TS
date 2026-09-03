import { AccessDeniedError } from "../errors";
import { PlaywrightLike, withPooledPage } from "../browser-pool";
import { setCookiesOnJar } from "../lib/cookies";
import { importOptional } from "../lib/optional-import";
import { OrchestrateChallengeContext, OrchestrateSolverFn, SolverOptions, SolverResult } from "../lib/solver-types";
import { ChallengeBlockedError, clickVerify, disableMediaRoutes, waitForChallengeClear, WaitPage } from "./challenge-wait";
import { dumpBrowserPage } from "./dump-page";

function applySolverContext(context: OrchestrateChallengeContext, options?: SolverOptions): void {
    if (!context.debugDir && options?.debugDir) context.debugDir = options.debugDir;
    if (!context.logger && options?.logger) context.logger = options.logger;
}

function resolveProxy(context: OrchestrateChallengeContext, options?: SolverOptions): string | undefined {
    return context.proxy ?? options?.proxy;
}

async function loadEngine(id: string, label: string): Promise<PlaywrightLike> {
    try {
        const m = (await importOptional(id)) as { default?: PlaywrightLike; chromium?: PlaywrightLike["chromium"] };
        const lib = (m.default ?? m) as PlaywrightLike;
        if (!lib?.chromium?.launch) {
            throw new Error(label + " not found. Install with: pnpm add " + id);
        }
        return lib;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found/i.test(msg)) throw err;
        throw new Error(label + " not found. Install with: pnpm add " + id, { cause: err });
    }
}

async function runChromiumSolve(lib: PlaywrightLike, engine: string, context: OrchestrateChallengeContext, options?: SolverOptions): Promise<SolverResult> {
    applySolverContext(context, options);
    const timeout = context.timeout ?? options?.timeout ?? 45000;
    const deadline = Date.now() + timeout;
    const proxy = resolveProxy(context, options);

    return withPooledPage(
        lib,
        {
            engine,
            proxy,
            impersonate: context.impersonate ?? options?.impersonate,
            headless: options?.headless,
            sessionTtlMs: options?.sessionTtlMs,
            concurrency: options?.concurrency,
        },
        async (rawPage, pooledContext) => {
            const page = rawPage as unknown as WaitPage & { goto(url: string, opts?: object): Promise<unknown>; content(): Promise<string>; screenshot(opts?: object): Promise<Buffer | Uint8Array>; url?(): string };
            try {
                if (options?.disableMedia !== false) {
                    await disableMediaRoutes(page);
                }
                await page.goto(context.url, {
                    waitUntil: "domcontentloaded",
                    timeout,
                });
                const tabs = options?.tabsTillVerify ?? 1;
                if (tabs > 0) {
                    await clickVerify(page, tabs);
                }
                await waitForChallengeClear(page, deadline);
                if (typeof options?.waitInSeconds === "number" && options.waitInSeconds > 0) {
                    await new Promise((r) => setTimeout(r, options.waitInSeconds! * 1000));
                }
                const cookies = await pooledContext.cookies(context.url);
                const userAgent = await page.evaluate(() => navigator.userAgent);
                const body = await page.content();
                const result: SolverResult = {
                    cookies,
                    userAgent,
                    body,
                    status: 200,
                    url: typeof page.url === "function" ? page.url() : context.url,
                };
                // A successfully rendered response is usable even when Cloudflare
                // elects not to issue cf_clearance (common with stealth browsers).
                await setCookiesOnJar(context.cookieJar, context.url, cookies, {
                    requireClearance: false,
                });
                return result;
            } catch (err) {
                await dumpBrowserPage(context, page, err);
                if (err instanceof ChallengeBlockedError) {
                    throw new AccessDeniedError(undefined, context.response);
                }
                throw err;
            }
        },
    );
}

export function createPatchrightOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<SolverResult> => {
        const lib = await loadEngine("patchright", "patchright");
        return runChromiumSolve(lib, "patchright", context, options);
    };
}

export function createPlaywrightOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<SolverResult> => {
        const lib = await loadEngine("playwright", "Playwright");
        return runChromiumSolve(lib, "playwright", context, options);
    };
}
