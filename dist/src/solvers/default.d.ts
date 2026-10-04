import { OrchestrateSolverFn, SolverOptions } from "../lib/solver-types";
/**
 * Tries, in order: patchright → FLARESOLVERR_URL → BROWSERLESS_WS_ENDPOINT → playwright → puppeteer.
 */
export declare function createDefaultOrchestrateSolver(options?: SolverOptions): OrchestrateSolverFn;
