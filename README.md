# cloudscraper-ts

TypeScript library that bypasses Cloudflare JS challenges and some other anti-bot interstitial pages. Rewrite of [codemanki/cloudscraper](https://github.com/codemanki/cloudscraper).

Published from Git only (`github:dikodahan/CloudScraper-TS#<ref>`), never npm. `prepare` builds `dist/`.

## Requirements

- **Node.js ≥ 24**
- **pnpm ≥ 12** (this repo pins `packageManager: pnpm@12.9.1`; npm/yarn are not supported for local installs)

## Install

```bash
pnpm add github:dikodahan/CloudScraper-TS#master
```

Pin a tag or SHA in production. For a private repo, use a deploy key or token — do not put credentials in `package.json`.

Optional (recommended) extras:

```bash
pnpm add impit patchright
pnpm exec patchright install chromium
```

`impit` supplies a Chrome TLS/JA3/JA4 + HTTP/2 fingerprint. `patchright` is the local browser solver (patched Chromium, Playwright API). Both are optional; without `impit` the library falls back to `got` ^16 (built-in HTTP/2). SOCKS and HTTP/2 proxies need `impit`; the `got` fallback supports HTTP(S) proxies over HTTP/1.1 via `hpagent` (bundled).

## Usage

```js
const request = require("cloudscraper-ts").default;
const { createDefaultOrchestrateSolver, closeBrowserPool } = require("cloudscraper-ts");

const res = await request(
    { uri: "https://nowsecure.nl/" },
    {
        proxy: process.env.HTTPS_PROXY, // optional; http / https / socks4 / socks5
        impersonate: "chrome", // optional impit profile, e.g. "chrome151"
        logger: (level, msg, meta) => console.warn(level, msg, meta),
        debugDir: "./debug-dumps", // HTML + cookies + screenshot on solver failure
        solveOrchestrateChallenge: createDefaultOrchestrateSolver({
            headless: true,
            timeout: 45000,
            tabsTillVerify: 1,
            // disableMedia defaults to false (managed Turnstile needs assets)
        }),
    },
);
console.log(res.statusCode, String(res.body).slice(0, 200));
await closeBrowserPool(); // allow Node to exit after pooled Chromium solves
```

`request.debug = true` is a console shim for `logger`.

A GET that a solver already fetched is returned as-is (`SolverResult.body`) — no second HTTP round-trip.

## Orchestrate solvers

`createDefaultOrchestrateSolver()` tries, in order:

1. **patchright** (local patched Chromium)
2. **FlareSolverr** if `FLARESOLVERR_URL` is set (e.g. `http://localhost:8191/v1`)
3. **Browserless** if `BROWSERLESS_WS_ENDPOINT` is set (`puppeteer-core`)
4. **playwright** (runtime fallback)
5. **puppeteer** (runtime fallback)

Force one backend:

```js
const { createPatchrightOrchestrateSolver, createFlareSolverrOrchestrateSolver, createBrowserlessOrchestrateSolver } = require("cloudscraper-ts");

createPatchrightOrchestrateSolver({ headless: true, timeout: 45000 });
createFlareSolverrOrchestrateSolver(process.env.FLARESOLVERR_URL, { session: "scrape", maxTimeout: 60000 });
createBrowserlessOrchestrateSolver(process.env.BROWSERLESS_WS_ENDPOINT);
```

Copy `.env.sample` → `.env` for local `FLARESOLVERR_URL` / `BROWSERLESS_WS_ENDPOINT` / `TEST_URL`.

### Custom solver

```ts
solveOrchestrateChallenge: async (ctx) => ({
    cookies: [{ name: "cf_clearance", value: "...", path: "/" }],
    userAgent: "Mozilla/5.0 ...", // required — clearance is bound to this UA
    body: "<html>optional solved page</html>",
    status: 200,
    url: ctx.url,
});
```

Returning `void` and only mutating `ctx.cookieJar` still works for one minor version (follow-up request, UA not pinned).

## Options

| Field | Where | Notes |
|---|---|---|
| `proxy` | `DefaultParams` / `SolverOptions` | Transport + browser (`http` / `https` / `socks4` / `socks5` via `impit`). Got fallback: HTTP(S) only. FlareSolverr `user:pass@` is split for `sessions.create`. |
| `impersonate` | `DefaultParams` | impit browser id (`chrome`, `chrome151`, `firefox`, …). |
| `logger` | `DefaultParams` | `(level, msg, meta?) => void`. |
| `debugDir` | `DefaultParams` / `SolverOptions` | Solver-failure dump; FlareSolverr `returnScreenshot`. |
| `tabsTillVerify` | `SolverOptions` | Tab-then-Space into Turnstile (re-tried while waiting). `0` disables. Default `1`. |
| `disableMedia` | `SolverOptions` | Block images/CSS/fonts. Default `false` (FlareSolverr-aligned). |
| `browserWaitTimeoutSec` | `SolverOptions` | Seconds between Turnstile re-click attempts. Default `1` / `CLOUDSCRAPER_BROWSER_WAIT_TIMEOUT`. |
| `session` | `SolverOptions` | FlareSolverr session id. Default `"cloudscraper-ts"`. `false` = cold start. |
| `sessionTtlMinutes` / `sessionTtlMs` | `SolverOptions` | FlareSolverr TTL / local browser pool TTL. |
| `maxTimeout` | `SolverOptions` | FlareSolverr solve timeout (ms). |
| `returnOnlyCookies` | `SolverOptions` | Default `true` for non-GET. |
| `waitInSeconds` | `SolverOptions` | Extra wait after the challenge clears. |
| `concurrency` | `SolverOptions` | Max concurrent local browser solves. Default `2`. |
| `challengesToSolve` | `DefaultParams` | Orchestrate retry budget. Default `3`. |

`destroyFlareSolverrSession(url, session)` closes a remote FlareSolverr browser. `closeBrowserPool()` closes pooled patchright/playwright browsers.

## Errors

| Class | `errorType` | Retryable |
|---|---|---|
| `RequestError` | 0 | network-dependent |
| `AccessDeniedError` | 1 | no (WAF / IP ban) |
| `CloudflareError` | 2 | no |
| `ParserError` | 3 | no |
| `OrchestrateLoopError` | 4 | no |
| `OrchestrateChallengeError` | 7 | no (no solver configured) |
| `FlareSolverrError` | 8 | no |

Do not branch on removed types (`CaptchaError`, `StatusCodeError`, `TransformError`).

## Tests / develop

```bash
pnpm install           # requires pnpm ≥ 12; prepare builds dist/
pnpm build
pnpm test              # fixtures + live target matrix (includes got-fallback)
pnpm test:server       # UI on :8765
pnpm test:once         # one-shot CLI
pnpm lint
```
