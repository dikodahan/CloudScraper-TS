export interface PooledBrowser {
    newContext(opts?: Record<string, unknown>): Promise<PooledContext>;
    close(): Promise<void>;
}
export interface PooledContext {
    newPage(): Promise<PooledPage>;
    cookies(urls?: string | string[]): Promise<Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string;
    }>>;
    close(): Promise<void>;
}
export interface PooledPage {
    close(): Promise<void>;
    [key: string]: unknown;
}
export interface PlaywrightLike {
    chromium: {
        launch(opts?: Record<string, unknown>): Promise<PooledBrowser>;
    };
}
export interface PoolOptions {
    engine: string;
    proxy?: string;
    impersonate?: string;
    headless?: boolean;
    sessionTtlMs?: number;
    concurrency?: number;
}
export declare function setMaxConcurrentSolves(n: number): void;
export declare function closeBrowserPool(): Promise<void>;
export declare function withPooledPage<T>(lib: PlaywrightLike, opts: PoolOptions, fn: (page: PooledPage, context: PooledContext) => Promise<T>): Promise<T>;
