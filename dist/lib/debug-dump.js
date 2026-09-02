"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSolverDebugDump = writeSolverDebugDump;
exports.dumpOnSolverFailure = dumpOnSolverFailure;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("./logger");
async function writeSolverDebugDump(debugDir, files) {
    fs_1.default.mkdirSync(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path_1.default.join(debugDir, stamp);
    fs_1.default.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        if (content == null)
            continue;
        fs_1.default.writeFileSync(path_1.default.join(dir, name), content);
    }
    return dir;
}
async function dumpOnSolverFailure(context, err, extra) {
    if (!context.debugDir)
        return;
    try {
        const cookieStr = await context.cookieJar.getCookieString(context.url);
        await writeSolverDebugDump(context.debugDir, {
            "error.txt": err instanceof Error ? err.stack || err.message : String(err),
            "challenge.html": context.body,
            "cookies.txt": cookieStr,
            ...extra,
        });
    }
    catch (dumpErr) {
        (0, logger_1.log)(context.logger, "warn", "Failed to write solver debug dump", { error: dumpErr instanceof Error ? dumpErr.message : String(dumpErr) });
    }
}
