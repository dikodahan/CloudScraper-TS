/**
 * Optional: install puppeteer to use createPuppeteerOrchestrateSolver.
 * Types here are minimal for the solver only.
 */
declare module "puppeteer" {
    export function launch(options?: { headless?: boolean; args?: string[] }): Promise<{
        newPage(): Promise<{
            goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
            cookies(): Promise<Array<{
                name: string;
                value: string;
                domain?: string;
                path?: string;
                expires?: number;
                httpOnly?: boolean;
                secure?: boolean;
            }>>;
        }>;
        close(): Promise<void>;
    }>;
}

declare module "puppeteer-core" {
    export function launch(options?: { headless?: boolean; args?: string[] }): Promise<{
        newPage(): Promise<{
            goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
            cookies(): Promise<Array<{
                name: string;
                value: string;
                domain?: string;
                path?: string;
                expires?: number;
                httpOnly?: boolean;
                secure?: boolean;
            }>>;
        }>;
        close(): Promise<void>;
    }>;
}
