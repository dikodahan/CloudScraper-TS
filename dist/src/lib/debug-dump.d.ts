import { CookieJar } from "tough-cookie";
import { Logger } from "./logger";
export declare function writeSolverDebugDump(debugDir: string, files: Record<string, string | Buffer | undefined>): Promise<string>;
export declare function dumpOnSolverFailure(context: {
    debugDir?: string;
    url: string;
    body: string;
    cookieJar: CookieJar;
    logger?: Logger;
}, err: unknown, extra?: Record<string, string | Buffer | undefined>): Promise<void>;
