import { OrchestrateSolverFn, SolverOptions } from "../lib/solver-types";
export declare function createBrowserlessOrchestrateSolver(browserWSEndpoint: string, options?: SolverOptions): OrchestrateSolverFn;
export declare function createPuppeteerOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn;
