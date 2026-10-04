export declare const CHALLENGE_TITLES: string[];
export declare const CHALLENGE_SELECTORS: string[];
export declare class ChallengeBlockedError extends Error {
    name: string;
    constructor();
}
export declare function isChallengeTitle(title: string): boolean;
export interface WaitPage {
    title(): Promise<string>;
    locator?(selector: string): {
        count(): Promise<number>;
        inputValue(): Promise<string>;
        click(opts?: object): Promise<void>;
        first?(): {
            click(opts?: object): Promise<void>;
            count?(): Promise<number>;
        };
    };
    $?(selector: string): Promise<unknown>;
    keyboard: {
        press(key: string): Promise<void>;
    };
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    waitForLoadState?(state: string, opts?: object): Promise<void>;
    route?(pattern: string, handler: (route: RouteLike) => unknown): Promise<void>;
    frames?(): Array<{
        url(): string;
        locator(selector: string): {
            first(): {
                click(opts?: object): Promise<void>;
            };
        };
    }>;
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
export declare function waitForChallengeClear(page: WaitPage, deadline: number, options?: WaitForChallengeClearOptions): Promise<void>;
/**
 * Attempt to complete the Cloudflare Turnstile / "Verify you are human" control.
 * Mirrors FlareSolverr: pause, Tab×N, Space, focus-helper reset between tries,
 * and only the first matching verify button (fixes multi-button focus bugs).
 */
export declare function clickVerify(page: WaitPage, tabs: number): Promise<void>;
interface RouteLike {
    request(): {
        resourceType(): string;
    };
    abort(): Promise<unknown>;
    continue(): Promise<unknown>;
}
export declare function disableMediaRoutes(page: WaitPage): Promise<void>;
export {};
