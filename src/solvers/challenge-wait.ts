import { ACCESS_DENIED_SELECTORS, ACCESS_DENIED_TITLES } from "../lib/detect";

export const CHALLENGE_TITLES = [
    "Just a moment...",
    "Just a moment",
    "DDoS-Guard",
    // Hebrew Cloudflare interstitial (kan.org.il and other IL locales)
    "רק רגע...",
    "רק רגע",
];

export const CHALLENGE_SELECTORS = [
    "#cf-challenge-running",
    ".ray_id",
    ".attack-box",
    "#cf-please-wait",
    "#challenge-spinner",
    "#trk_jschal_js",
    "#turnstile-wrapper",
    ".lds-ring",
    "td.info #js_info",
    "div.vc div.text-box h2",
    "input[name='cf-turnstile-response']",
];

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

export function isChallengeTitle(title: string): boolean {
    const t = title.trim();
    if (CHALLENGE_TITLES.includes(t)) return true;
    if (t.startsWith("Just a moment")) return true;
    // Hebrew "Just a moment" / "Only a moment"
    if (t.startsWith("רק רגע")) return true;
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WaitPage {
    title(): Promise<string>;
    locator?(selector: string): {
        count(): Promise<number>;
        inputValue(): Promise<string>;
        click(opts?: object): Promise<void>;
        first?(): { click(opts?: object): Promise<void>; count?(): Promise<number> };
    };
    $?(selector: string): Promise<unknown>;
    keyboard: { press(key: string): Promise<void> };
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    waitForLoadState?(state: string, opts?: object): Promise<void>;
    route?(pattern: string, handler: (route: RouteLike) => unknown): Promise<void>;
    frames?(): Array<{
        url(): string;
        locator(selector: string): { first(): { click(opts?: object): Promise<void> } };
    }>;
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

export interface WaitForChallengeClearOptions {
    /** Re-attempt Turnstile verify while waiting (FlareSolverr loop). Default 1. 0 disables. */
    tabsTillVerify?: number;
    /** Seconds between verify attempts while still challenged. Default 1. */
    browserWaitTimeoutSec?: number;
}

/**
 * Poll until challenge titles/selectors clear, periodically re-clicking Turnstile
 * like FlareSolverr's `_evil_logic` loop.
 */
export async function waitForChallengeClear(
    page: WaitPage,
    deadline: number,
    options?: WaitForChallengeClearOptions
): Promise<void> {
    const tabs = options?.tabsTillVerify ?? 0;
    const sliceSec = Math.max(1, options?.browserWaitTimeoutSec ?? Number(process.env.CLOUDSCRAPER_BROWSER_WAIT_TIMEOUT || 1));
    const sliceMs = sliceSec * 1000;
    let nextVerifyAt = Date.now();

    while (Date.now() < deadline) {
        let title = "";
        try {
            title = await page.title();
        } catch {
            /* keep empty title and continue selector checks */
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

        if (tabs > 0 && Date.now() >= nextVerifyAt) {
            await clickVerify(page, tabs);
            nextVerifyAt = Date.now() + sliceMs;
        }

        await sleep(250);
    }
    throw new Error("Challenge wait timed out");
}

/** FlareSolverr-style focus helper so Tab lands on the Turnstile widget. */
async function resetFocusHelper(page: WaitPage): Promise<void> {
    try {
        await page.evaluate(() => {
            const old = document.getElementById("__focus_helper");
            if (old) old.remove();
            const el = document.createElement("button");
            el.id = "__focus_helper";
            el.style.position = "fixed";
            el.style.top = "0";
            el.style.left = "0";
            el.style.opacity = "0.01";
            el.style.pointerEvents = "none";
            document.body.prepend(el);
            el.focus();
        });
    } catch {
        /* page may be mid-navigation */
    }
}

async function clickTurnstileFrame(page: WaitPage): Promise<boolean> {
    if (typeof page.frames !== "function") return false;
    try {
        for (const frame of page.frames()) {
            const url = frame.url();
            if (!/challenges\.cloudflare\.com|turnstile/i.test(url)) continue;
            try {
                await frame.locator("input[type='checkbox'], body").first().click({ timeout: 1500, force: true });
                return true;
            } catch {
                /* try next frame */
            }
        }
    } catch {
        /* frames API unavailable */
    }
    return false;
}

/**
 * Attempt to complete the Cloudflare Turnstile / "Verify you are human" control.
 * Mirrors FlareSolverr: pause, Tab×N, Space, focus-helper reset between tries,
 * and only the first matching verify button (fixes multi-button focus bugs).
 */
export async function clickVerify(page: WaitPage, tabs: number): Promise<void> {
    if (tabs <= 0) return;
    const tokenSel = "input[name='cf-turnstile-response']";
    const verifyBtn = "input[type='button'][value='Verify you are human']";
    const appearBy = Date.now() + 5000;
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
    if (!visible) {
        // Managed challenges sometimes only expose the iframe.
        await clickTurnstileFrame(page);
        return;
    }

    // FlareSolverr pauses before the first Tab sequence so the widget can mount.
    await sleep(1000);
    const deadline = Date.now() + 12000;
    let previousToken = "";
    if (typeof page.locator === "function") {
        try {
            previousToken = await page.locator(tokenSel).inputValue();
        } catch {
            previousToken = "";
        }
    }

    while (Date.now() < deadline) {
        await resetFocusHelper(page);
        try {
            await page.evaluate(() => {
                const el = document.querySelector("input[name='cf-turnstile-response']");
                if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ block: "center" });
            });
        } catch {
            /* widget may not be in the DOM yet */
        }

        await clickTurnstileFrame(page);

        for (let i = 0; i < tabs; i++) {
            await page.keyboard.press("Tab");
            await sleep(100);
        }
        await sleep(200);
        await page.keyboard.press("Space");

        if (typeof page.locator === "function") {
            try {
                const val = await page.locator(tokenSel).inputValue();
                if (val && val !== previousToken) return;
            } catch {
                /* no token yet */
            }
            try {
                const btn = page.locator(verifyBtn);
                if ((await btn.count()) > 0) {
                    // Only the first button — FlareSolverr #1677 multi-button fix.
                    if (typeof btn.first === "function") {
                        await btn.first().click({ timeout: 1000 });
                    } else {
                        await btn.click({ timeout: 1000 });
                    }
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
