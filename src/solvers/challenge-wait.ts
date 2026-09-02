import { ACCESS_DENIED_SELECTORS, ACCESS_DENIED_TITLES } from "../lib/detect";

export const CHALLENGE_TITLES = ["Just a moment...", "Just a moment", "DDoS-Guard"];

export const CHALLENGE_SELECTORS = ["#cf-challenge-running", ".ray_id", ".attack-box", "#cf-please-wait", "#challenge-spinner", "#trk_jschal_js", "#turnstile-wrapper", ".lds-ring", "td.info #js_info", "div.vc div.text-box h2"];

export class ChallengeBlockedError extends Error {
    override name = "ChallengeBlockedError";
    constructor() {
        super("Cloudflare has blocked this request. Probably your IP is banned for this site.");
        this.name = "ChallengeBlockedError";
    }
}

function isAccessDeniedTitle(title: string): boolean {
    const t = title.trim();
    return ACCESS_DENIED_TITLES.some((denied) => t === denied || t.startsWith(denied));
}

function isChallengeTitle(title: string): boolean {
    const t = title.trim();
    if (CHALLENGE_TITLES.includes(t)) return true;
    return t.startsWith("Just a moment");
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitPage {
    title(): Promise<string>;
    locator?(selector: string): { count(): Promise<number>; inputValue(): Promise<string>; click(opts?: object): Promise<void> };
    $?(selector: string): Promise<unknown>;
    keyboard: { press(key: string): Promise<void> };
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    waitForLoadState?(state: string, opts?: object): Promise<void>;
    route?(pattern: string, handler: (route: RouteLike) => unknown): Promise<void>;
}

async function selectorPresent(page: WaitPage, selector: string): Promise<boolean> {
    if (typeof page.locator === "function") {
        try {
            return (await page.locator(selector).count()) > 0;
        } catch {
            return false;
        }
    }
    if (typeof page.$ === "function") {
        try {
            return !!(await page.$(selector));
        } catch {
            return false;
        }
    }
    return false;
}

export async function waitForChallengeClear(page: WaitPage, deadline: number): Promise<void> {
    while (Date.now() < deadline) {
        let title = "";
        try {
            title = await page.title();
        } catch {
            title = "";
        }
        if (isAccessDeniedTitle(title)) {
            throw new ChallengeBlockedError();
        }
        for (const sel of ACCESS_DENIED_SELECTORS) {
            if (await selectorPresent(page, sel)) {
                throw new ChallengeBlockedError();
            }
        }
        let anySelector = false;
        for (const sel of CHALLENGE_SELECTORS) {
            if (await selectorPresent(page, sel)) {
                anySelector = true;
                break;
            }
        }
        if (!isChallengeTitle(title) && !anySelector) {
            if (typeof page.waitForLoadState === "function") {
                await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
            }
            return;
        }
        await sleep(250);
    }
    throw new Error("Challenge wait timed out");
}

export async function clickVerify(page: WaitPage, tabs: number): Promise<void> {
    if (tabs <= 0) return;
    const tokenSel = "input[name='cf-turnstile-response']";
    const verifyBtn = "input[type='button'][value='Verify you are human']";
    const appearBy = Date.now() + 2500;
    let visible = false;
    while (Date.now() < appearBy) {
        if ((await selectorPresent(page, tokenSel)) || (await selectorPresent(page, verifyBtn))) {
            visible = true;
            break;
        }
        try {
            const title = await page.title();
            if (!isChallengeTitle(title)) return;
        } catch {
            return;
        }
        await sleep(200);
    }
    if (!visible) return;

    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
        try {
            await page.evaluate(() => {
                const el = document.querySelector("input[name='cf-turnstile-response']");
                if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ block: "center" });
                document.body?.focus();
            });
        } catch {
            /* widget may not be in the DOM yet */
        }
        for (let i = 0; i < tabs; i++) {
            await page.keyboard.press("Tab");
        }
        await page.keyboard.press("Space");
        if (typeof page.locator === "function") {
            try {
                const val = await page.locator(tokenSel).inputValue();
                if (val) return;
            } catch {
                /* no token yet */
            }
            try {
                const btn = page.locator(verifyBtn);
                if ((await btn.count()) > 0) {
                    await btn.click({ timeout: 1000 });
                }
            } catch {
                /* no verify button */
            }
        }
        try {
            const title = await page.title();
            if (!isChallengeTitle(title)) return;
        } catch {
            return;
        }
        await sleep(500);
    }
}

interface RouteLike {
    request(): { resourceType(): string };
    abort(): Promise<unknown>;
    continue(): Promise<unknown>;
}

export async function disableMediaRoutes(page: WaitPage): Promise<void> {
    if (typeof page.route !== "function") return;
    await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "image" || type === "stylesheet" || type === "font" || type === "media") {
            return route.abort();
        }
        return route.continue();
    });
}
