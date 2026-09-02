"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dumpBrowserPage = dumpBrowserPage;
const debug_dump_1 = require("../lib/debug-dump");
async function dumpBrowserPage(context, page, err) {
    if (!context.debugDir || !page)
        return;
    let html;
    let screenshot;
    try {
        if (typeof page.content === "function")
            html = await page.content();
    }
    catch {
        /* ignore */
    }
    try {
        if (typeof page.screenshot === "function") {
            const shot = await page.screenshot({ type: "png", fullPage: true });
            screenshot = Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
        }
    }
    catch {
        /* ignore */
    }
    await (0, debug_dump_1.dumpOnSolverFailure)(context, err, { "page.html": html, "screenshot.png": screenshot });
}
