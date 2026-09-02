import { OrchestrateSolverFn, SolverOptions } from "../lib/solver-types";
export interface FlareProxy {
    url: string;
    username?: string;
    password?: string;
}
/** Split `user:pass@host` for FlareSolverr `sessions.create` (auth is supported there, not on per-request proxy). */
export declare function parseFlareProxy(proxy?: string): FlareProxy | undefined;
export declare function destroyFlareSolverrSession(baseUrl: string, session?: string): Promise<void>;
export declare function createFlareSolverrOrchestrateSolver(baseUrl: string, options?: SolverOptions): OrchestrateSolverFn;
