# cloudscraper-ts
Node.JS library to bypass some of Cloudflare's anti-ddos page. All credit goes to the original author [here](https://github.com/codemanki/cloudscraper).

## About CloudScraper
There are some anti-bot pages such as [NovelUpdates](https://novelupdates.com) that can be bypassed via the normal [CloudScraper](https://npmjs.com/package/cloudscraper) package. I simply rewrote it and added TypeScript types to it.

## Usage
This is pretty scuffed, so I suggest you take a look at the original GitHub page for more documentation. Essentially, all that the function does is the following:
```typescript
const request = require("./dist/index").default;

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

Some sites show Cloudflare’s **"Just a moment..."** page (orchestrate / challenge-platform). That challenge runs in the browser and cannot be solved with plain HTTP. You can solve it in three ways (in order of precedence when using the default solver):

1. **FlareSolverr (optional)** – If the env variable `FLARESOLVERR_URL` is set (e.g. `http://localhost:8191/v1`), the default solver will call your [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) instance first. No Node browser dependency; useful when you already run FlareSolverr (e.g. in Docker). Copy `.env.sample` to `.env` and set `FLARESOLVERR_URL` for local testing.

2. **Puppeteer or Playwright (optional)** – If `FLARESOLVERR_URL` is not set or the request fails, the default solver tries **Puppeteer** first, then **Playwright**. Install at most one: `npm install puppeteer` or `npm install playwright`. Both are optional; if you use FlareSolverr you don’t need either. If neither is installed and FlareSolverr isn’t used, the solver will throw a clear message when the orchestrate challenge is hit.

**Default solver (recommended)** – uses the order above:

```javascript
const request = require("cloudscraper-ts").default;
const { createDefaultOrchestrateSolver } = require("cloudscraper-ts");

request(
  { uri: "https://example.com/protected" },
  {
    solveOrchestrateChallenge: createDefaultOrchestrateSolver({
      headless: true,
      timeout: 45000,
    }),
  }
)
  .then((res) => console.log(res.body))
  .catch((err) => console.error(err));
```

**Other options:**

- **FlareSolverr only**: pass `createFlareSolverrOrchestrateSolver(process.env.FLARESOLVERR_URL)`.
- **Pick a browser**: use `createPuppeteerOrchestrateSolver()` or `createPlaywrightOrchestrateSolver()` to force one.
- **Custom solver**: pass a `solveOrchestrateChallenge(context)` function. It receives `{ url, response, body, cookieJar }`. Open `url` in a browser (or call an API), then set the cookies on `cookieJar`. The library will retry with the new cookies.
- **No solver**: don’t pass a solver; the library throws `OrchestrateChallengeError` when the "Just a moment..." page is hit.