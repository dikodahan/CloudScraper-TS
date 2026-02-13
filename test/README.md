# CloudScraper-TS test UI

1. **Build** the project: `npm run build`
2. **Start** the test server: `npm run test:server`
3. **Open** in a browser: http://localhost:8765

**One-shot CLI**: `npm test` or `node test/server.js run [url]`. Default URL is `https://nowsecure.nl`. Override with `TEST_URL` or a third argument. Use `USE_PUPPETEER=1` to solve the orchestrate challenge with a headless browser. To use FlareSolverr instead, copy `.env.sample` to `.env` and set `FLARESOLVERR_URL=http://localhost:8191/v1` (the test server loads `.env` via dotenv).

Use the buttons to run requests against known Cloudflare-protected sites. The page shows:

- **Result** – success or error summary
- **Response preview** – truncated response body (for copying or inspecting)
- **Debug log** – timestamped `warn`/`log`/`error` output from the library (useful when reporting issues)

Check **Use Puppeteer…** to solve the “Just a moment…” (orchestrate) challenge on sites that use it Optional: install one of `puppeteer` or `playwright`; the server tries Puppeteer first, then Playwright.
