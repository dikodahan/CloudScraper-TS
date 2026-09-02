import fs from "fs";
import path from "path";
import { CookieJar } from "tough-cookie";
import { log, Logger } from "./logger";

export async function writeSolverDebugDump(debugDir: string, files: Record<string, string | Buffer | undefined>): Promise<string> {
    fs.mkdirSync(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(debugDir, stamp);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        if (content == null) continue;
        fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
}

export async function dumpOnSolverFailure(context: { debugDir?: string; url: string; body: string; cookieJar: CookieJar; logger?: Logger }, err: unknown, extra?: Record<string, string | Buffer | undefined>): Promise<void> {
    if (!context.debugDir) return;
    try {
        const cookieStr = await context.cookieJar.getCookieString(context.url);
        await writeSolverDebugDump(context.debugDir, {
            "error.txt": err instanceof Error ? err.stack || err.message : String(err),
            "challenge.html": context.body,
            "cookies.txt": cookieStr,
            ...extra,
        });
    } catch (dumpErr) {
        log(context.logger, "warn", "Failed to write solver debug dump", { error: dumpErr instanceof Error ? dumpErr.message : String(dumpErr) });
    }
}
