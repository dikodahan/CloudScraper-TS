# CloudScraper-TS test UI

1. **Build** the project: `pnpm build`
2. **Start** the test server: `pnpm test:server`
3. **Open** in a browser: http://localhost:8765

**Fixture + live tests**: `pnpm test` runs network-free detection tests over `test/fixtures/` then a live target matrix (`test/targets.js`). One-shot CLI: `pnpm test:once` or `node test/server.js run [url]`.

Use the buttons to run requests against known Cloudflare-protected sites. The page shows result, response preview, and debug log.

Check **Use headless browser…** to attach `createDefaultOrchestrateSolver()` (patchright → FlareSolverr → Browserless → playwright → puppeteer). Optional: `pnpm exec patchright install chromium`, or set `FLARESOLVERR_URL` in `.env`.
