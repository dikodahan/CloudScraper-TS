import { dumpOnSolverFailure } from "../lib/debug-dump";
import { OrchestrateChallengeContext } from "../lib/solver-types";

export async function dumpBrowserPage(context: OrchestrateChallengeContext, page: { content?(): Promise<string>; screenshot?(opts?: object): Promise<Buffer | Uint8Array> } | undefined, err: unknown): Promise<void> {
    if (!context.debugDir || !page) return;
    let html: string | undefined;
    let screenshot: Buffer | undefined;
    try {
        if (typeof page.content === "function") html = await page.content();
    } catch {
        /* ignore */
    }
    try {
        if (typeof page.screenshot === "function") {
            const shot = await page.screenshot({ type: "png", fullPage: true });
            screenshot = Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
        }
    } catch {
        /* ignore */
    }
    await dumpOnSolverFailure(context, err, { "page.html": html, "screenshot.png": screenshot });
}
