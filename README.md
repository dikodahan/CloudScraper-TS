# cloudscraper-ts
Node.JS library to bypass some of Cloudflare's anti-ddos page. All credit goes to the original author [here](https://github.com/codemanki/cloudscraper).

## About CloudScraper
There are some anti-bot pages such as [NovelUpdates](https://novelupdates.com) that can be bypassed via the normal [CloudScraper](https://npmjs.com/package/cloudscraper) package. I simply rewrote it and added TypeScript types to it.

## Install without publishing to npm

This project can be installed directly from GitHub; it does not need to be registered or published in the npm registry. The package's `prepare` script builds `dist/` automatically when npm installs it from Git.

Pin a release tag or commit SHA in production so deployments remain reproducible:

```bash
# Public repository, using the current master branch
npm install "github:dikodahan/CloudScraper-TS#master"

# SSH (also works with a private repository when the machine has GitHub SSH access)
npm install "git+ssh://git@github.com/dikodahan/CloudScraper-TS.git#master"

# Local development from a sibling checkout
npm install "../CloudScraper-TS"
```

The resulting entry in the consuming project's `package.json` can be:

```json
{
  "dependencies": {
    "cloudscraper-ts": "github:dikodahan/CloudScraper-TS#master"
  }
}
```

Replace `master` with a commit SHA or release tag when one is available for reproducible production deployments. For a private repository in CI, configure a read-only GitHub deploy key or token on the consuming server. Do not embed credentials in `package.json` or commit them to the repository.

## Usage
After installing from GitHub, import it by package name:

```typescript
const request = require("cloudscraper-ts").default;

const body = {
    action: "nd_ajaxsearchmain",
    strType: "desktop",
    strOne: "Mushoku Tensei",
    strSearchType: "series"
}
request({
    uri: "https://www.novelupdates.com/wp-admin/admin-ajax.php",
    method: "POST",
    formData: body
}, {
    challengesToSolve: 3
}).then(res => {
    console.log(res.body);
});
```

## "Just a moment..." (Orchestrate) challenge

Some sites show Cloudflare’s **"Just a moment..."** page (orchestrate / challenge-platform). That challenge runs in the browser and cannot be solved with plain HTTP.

### Recommended on a private / unrestricted Node server: Playwright

If you run this library on your own Node server (not a restricted serverless platform like Vercel Hobby), **install Playwright** and use the default orchestrate solver. That is the simplest and most reliable path:

```bash
# In the consuming project (or this repo for local testing)
npm install playwright
npx playwright install chromium
```

Then:

```javascript
const request = require("cloudscraper-ts").default;
const { createDefaultOrchestrateSolver } = require("cloudscraper-ts");

request(
  { uri: "https://nowsecure.nl/" },
  {
    solveOrchestrateChallenge: createDefaultOrchestrateSolver({
      headless: true,
      timeout: 45000,
    }),
  }
)
  .then((res) => console.log(res.statusCode, String(res.body).slice(0, 200)))
  .catch((err) => console.error(err));
```

**Requirements for Playwright on a private server:**

- Node.js **>= 24** (this package’s engines field).
- System libraries required by Chromium (Playwright’s install script usually handles this; on Linux you may need `npx playwright install-deps` once).
- Enough RAM for a headless Chromium session (typically a few hundred MB per concurrent solve).
- Outbound HTTPS access to the target sites.

Playwright remains an **optional peer dependency**. If it is not installed, the default solver falls through to Puppeteer (also optional) or remote solvers when configured.

### Solver order (default)

When using `createDefaultOrchestrateSolver()`, the library tries, in order:

1. **FlareSolverr (optional)** – If `FLARESOLVERR_URL` is set (e.g. `http://localhost:8191/v1`), call your [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) instance first. Useful when you already run FlareSolverr (e.g. in Docker). Copy `.env.sample` to `.env` and set `FLARESOLVERR_URL` for local testing.

2. **Browserless (optional, for serverless)** – If `BROWSERLESS_WS_ENDPOINT` is set (e.g. `wss://production-sfo.browserless.io?token=YOUR_API_KEY`), connect to [Browserless](https://www.browserless.io) with `puppeteer-core`. Prefer this on restricted platforms; on a private server, Playwright is usually better.

3. **Playwright (optional, recommended for private servers)** – `npm install playwright` then `npx playwright install chromium`.

4. **Puppeteer (optional)** – `npm install puppeteer`.

If none of these are available, the solver throws a clear error when the orchestrate challenge is hit.

**Other options:**

- **FlareSolverr only**: pass `createFlareSolverrOrchestrateSolver(process.env.FLARESOLVERR_URL)`.
- **Browserless only**: pass `createBrowserlessOrchestrateSolver(process.env.BROWSERLESS_WS_ENDPOINT)` (and install `puppeteer-core`).
- **Pick a browser**: use `createPuppeteerOrchestrateSolver()` or `createPlaywrightOrchestrateSolver()` to force one.
- **Custom solver**: pass a `solveOrchestrateChallenge(context)` function. It receives `{ url, response, body, cookieJar }`. Open `url` in a browser (or call an API), then set the cookies on `cookieJar`. The library will retry with the new cookies.
- **No solver**: don’t pass a solver; the library throws `OrchestrateChallengeError` when the "Just a moment..." page is hit.

### Using with Next.js / webpack (optional Puppeteer)

If you depend on `cloudscraper-ts` in a Next.js project but **never** use the browser solver (you only call the basic HTTP API), bundlers like webpack may still see the internal `require("puppeteer")` in the compiled output and try to resolve it.

To avoid installing Puppeteer in that case, you can alias it to `false` in your Next config:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... your existing config ...
  webpack(config, { isServer }) {
    if (isServer) {
      // cloudscraper-ts’s browser solver path references puppeteer,
      // but if you never use it, you can safely stub it out.
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        puppeteer: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
```

If you later decide to use the Puppeteer-based solver, install `puppeteer` and remove this alias so the real module can be bundled.