import { OrchestrateChallengeContext } from "../lib/solver-types";
export declare function dumpBrowserPage(context: OrchestrateChallengeContext, page: {
    content?(): Promise<string>;
    screenshot?(opts?: object): Promise<Buffer | Uint8Array>;
} | undefined, err: unknown): Promise<void>;
