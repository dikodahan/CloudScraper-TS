import { AccessDeniedError } from "../errors";
import { setCookiesOnJar } from "../lib/cookies";
import { importOptional } from "../lib/optional-import";
import { CookieForJar, OrchestrateChallengeContext, OrchestrateSolverFn, SolverOptions, SolverResult } from "../lib/solver-types";
import { ChallengeBlockedError, clickVerify, waitForChallengeClear, WaitPage } from "./challenge-wait";
import { dumpBrowserPage } from "./dump-page";

interface BrowserLike {
    newPage(): Promise<PuppeteerPage>;
    close(): Promise<void>;
}

interface PuppeteerPage extends WaitPage {
    goto(url: string, opts?: object): Promise<unknown>;
    cookies(): Promise<CookieForJar[]>;
    content(): Promise<string>;
    screenshot(opts?: object): Promise<Buffer | Uint8Array>;
    setRequestInterception?(value: boolean): Promise<void>;
    on?(event: string, handler: (request: { resourceType(): string; abort(): Promise<unknown>; continue(): Promise<unknown> }) => unknown): void;
    url?(): string;
}

function rethrowBlocked(err: unknown, context: OrchestrateChallengeContext): never {
    if (err instanceof ChallengeBlockedError) {
        throw new AccessDeniedError(undefined, context.response);
    }
    throw err;
}

function applySolverContext(context: OrchestrateChallengeContext, options?: SolverOptions): void {
    if (!context.debugDir && options?.debugDir) context.debugDir = options.debugDir;
    if (!context.logger && options?.logger) context.logger = options.logger;
}

async function interceptMedia(page: PuppeteerPage): Promise<void> {
    if (typeof page.setRequestInterception !== "function" || typeof page.on !== "function") return;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
        const type = request.resourceType();
        if (type === "image" || type === "stylesheet" || type === "font" || type === "media") {
            return request.abort();
        }
        return request.continue();
    });
}

async function solveWithPage(page: PuppeteerPage, context: OrchestrateChallengeContext, options?: SolverOptions): Promise<SolverResult> {
    const timeout = context.timeout ?? options?.timeout ?? 45000;
    const deadline = Date.now() + timeout;
    if (options?.disableMedia !== false) {
        await interceptMedia(page);
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
    const cookies = await page.cookies();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const body = await page.content();
    await setCookiesOnJar(context.cookieJar, context.url, cookies);
    return {
        cookies,
        userAgent,
        body,
        status: 200,
        url: typeof page.url === "function" ? page.url() : context.url,
    };
}

export function createBrowserlessOrchestrateSolver(browserWSEndpoint: string, options?: SolverOptions): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<SolverResult> => {
        applySolverContext(context, options);
        let puppeteerCore: { connect: (opts: { browserWSEndpoint: string }) => Promise<BrowserLike> };
        try {
            const m = (await importOptional("puppeteer-core")) as { default?: { connect: (opts: { browserWSEndpoint: string }) => Promise<BrowserLike> }; connect?: (opts: { browserWSEndpoint: string }) => Promise<BrowserLike> };
            puppeteerCore = (m.default ?? m) as typeof puppeteerCore;
        } catch {
            throw new Error("puppeteer-core not found. Install with: pnpm add puppeteer-core");
        }
        const browser = await puppeteerCore.connect({ browserWSEndpoint });
        let page: PuppeteerPage | undefined;
        try {
            page = await browser.newPage();
            return await solveWithPage(page, context, options);
        } catch (err) {
            await dumpBrowserPage(context, page, err);
            rethrowBlocked(err, context);
        } finally {
            await browser.close();
        }
    };
}

export function createPuppeteerOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn {
    return async (context: OrchestrateChallengeContext): Promise<SolverResult> => {
        applySolverContext(context, options);
        let puppeteer: { launch: (opts: object) => Promise<BrowserLike> };
        try {
            const m = (await importOptional("puppeteer")) as { default?: { launch: (opts: object) => Promise<BrowserLike> }; launch?: (opts: object) => Promise<BrowserLike> };
            puppeteer = (m.default ?? m) as typeof puppeteer;
        } catch {
            throw new Error("Puppeteer not found. Install with: pnpm add puppeteer");
        }
        const proxy = context.proxy ?? options?.proxy;
        const args = ["--no-sandbox", "--disable-setuid-sandbox"];
        if (proxy) args.push("--proxy-server=" + proxy);
        const browser = await puppeteer.launch({
            headless: options?.headless !== false,
            args,
        });
        let page: PuppeteerPage | undefined;
        try {
            page = await browser.newPage();
            return await solveWithPage(page, context, options);
        } catch (err) {
            await dumpBrowserPage(context, page, err);
            rethrowBlocked(err, context);
        } finally {
            await browser.close();
        }
    };
}
