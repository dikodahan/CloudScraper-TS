/**
 * Optional: install playwright to use createPlaywrightOrchestrateSolver.
 * Minimal types for the solver only.
 */
declare module "playwright" {
    export const chromium: {
        launch(options?: { headless?: boolean; args?: string[] }): Promise<{
            newPage(): Promise<{
                goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
                context(): {
                    cookies(url?: string): Promise<Array<{
                        name: string;
                        value: string;
                        domain?: string;
                        path?: string;
                        expires?: number;
                        httpOnly?: boolean;
                        secure?: boolean;
                    }>>;
                };
            }>;
            close(): Promise<void>;
        }>;
    };
}
