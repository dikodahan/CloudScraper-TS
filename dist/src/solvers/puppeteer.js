"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBrowserlessOrchestrateSolver = createBrowserlessOrchestrateSolver;
exports.createPuppeteerOrchestrateSolver = createPuppeteerOrchestrateSolver;
const errors_1 = require("../errors");
const cookies_1 = require("../lib/cookies");
const optional_import_1 = require("../lib/optional-import");
const challenge_wait_1 = require("./challenge-wait");
const dump_page_1 = require("./dump-page");
function rethrowBlocked(err, context) {
    if (err instanceof challenge_wait_1.ChallengeBlockedError) {
        throw new errors_1.AccessDeniedError(undefined, context.response);
    }
    throw err;
}
function applySolverContext(context, options) {
    if (!context.debugDir && options?.debugDir)
        context.debugDir = options.debugDir;
    if (!context.logger && options?.logger)
        context.logger = options.logger;
}
async function interceptMedia(page) {
    if (typeof page.setRequestInterception !== "function" || typeof page.on !== "function")
        return;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
        const type = request.resourceType();
        if (type === "image" || type === "stylesheet" || type === "font" || type === "media") {
            return request.abort();
        }
        return request.continue();
    });
}
async function solveWithPage(page, context, options) {
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
        await (0, challenge_wait_1.clickVerify)(page, tabs);
    }
    await (0, challenge_wait_1.waitForChallengeClear)(page, deadline);
    if (typeof options?.waitInSeconds === "number" && options.waitInSeconds > 0) {
        await new Promise((r) => setTimeout(r, options.waitInSeconds * 1000));
    }
    const cookies = await page.cookies();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const body = await page.content();
    await (0, cookies_1.setCookiesOnJar)(context.cookieJar, context.url, cookies);
    return {
        cookies,
        userAgent,
        body,
        status: 200,
        url: typeof page.url === "function" ? page.url() : context.url,
    };
}
function createBrowserlessOrchestrateSolver(browserWSEndpoint, options) {
    return async (context) => {
        applySolverContext(context, options);
        let puppeteerCore;
        try {
            const m = (await (0, optional_import_1.importOptional)("puppeteer-core"));
            puppeteerCore = (m.default ?? m);
        }
        catch {
            throw new Error("puppeteer-core not found. Install with: pnpm add puppeteer-core");
        }
        const browser = await puppeteerCore.connect({ browserWSEndpoint });
        let page;
        try {
            page = await browser.newPage();
            return await solveWithPage(page, context, options);
        }
        catch (err) {
            await (0, dump_page_1.dumpBrowserPage)(context, page, err);
            rethrowBlocked(err, context);
        }
        finally {
            await browser.close();
        }
    };
}
function createPuppeteerOrchestrateSolver(options) {
    return async (context) => {
        applySolverContext(context, options);
        let puppeteer;
        try {
            const m = (await (0, optional_import_1.importOptional)("puppeteer"));
            puppeteer = (m.default ?? m);
        }
        catch {
            throw new Error("Puppeteer not found. Install with: pnpm add puppeteer");
        }
        const proxy = context.proxy ?? options?.proxy;
        const args = ["--no-sandbox", "--disable-setuid-sandbox"];
        if (proxy)
            args.push("--proxy-server=" + proxy);
        const browser = await puppeteer.launch({
            headless: options?.headless !== false,
            args,
        });
        let page;
        try {
            page = await browser.newPage();
            return await solveWithPage(page, context, options);
        }
        catch (err) {
            await (0, dump_page_1.dumpBrowserPage)(context, page, err);
            rethrowBlocked(err, context);
        }
        finally {
            await browser.close();
        }
    };
}
