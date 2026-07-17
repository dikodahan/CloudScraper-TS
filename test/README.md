# CloudScraper-TS test UI

1. **Build** the project: `npm run build`
2. **Start** the test server: `npm run test:server`
3. **Open** in a browser: http://localhost:8765

**One-shot CLI**: `npm test` or `node test/server.js run [url]`. Default URL is `https://nowsecure.nl`. Override with `TEST_URL` or a third argument. Use `USE_PUPPETEER=1` to enable the default orchestrate solver (Playwright recommended: `npm install playwright && npx playwright install chromium`). For FlareSolverr/Browserless, copy `.env.sample` to `.env` and set the relevant env vars.

Use the buttons to run requests against known Cloudflare-protected sites. The page shows:

- **Result** – success or error summary
- **Response preview** – truncated response body (for copying or inspecting)
- **Debug log** – timestamped `warn`/`log`/`error` output from the library (useful when reporting issues)

Check **Use Puppeteer…** to solve the “Just a moment…” (orchestrate) challenge on sites that use it Optional: install one of `puppeteer` or `playwright`; the server tries Puppeteer first, then Playwright.
