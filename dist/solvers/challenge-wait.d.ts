export declare const CHALLENGE_TITLES: string[];
export declare const CHALLENGE_SELECTORS: string[];
export declare class ChallengeBlockedError extends Error {
    name: string;
    constructor();
}
export interface WaitPage {
    title(): Promise<string>;
    locator?(selector: string): {
        count(): Promise<number>;
        inputValue(): Promise<string>;
        click(opts?: object): Promise<void>;
    };
    $?(selector: string): Promise<unknown>;
    keyboard: {
        press(key: string): Promise<void>;
    };
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
    waitForLoadState?(state: string, opts?: object): Promise<void>;
    route?(pattern: string, handler: (route: RouteLike) => unknown): Promise<void>;
}
export declare function waitForChallengeClear(page: WaitPage, deadline: number): Promise<void>;
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
