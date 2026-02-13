/**
 * Test server for CloudScraper-TS.
 * Serves test/index.html and exposes POST /fetch to run cloudscraper against a URL.
 * Run: node test/server.js  (or npm run test:server)
 * Then open http://localhost:8765 in a browser.
 *
 * One-shot CLI: node test/server.js run [url]
 * Default URL: https://nowsecure.nl. USE_PUPPETEER=1 to solve orchestrate challenge.
 * For local testing, copy .env.sample to .env and set FLARESOLVERR_URL (and optionally TEST_URL).
 */

try {
    require("dotenv").config();
} catch (_) {
    // dotenv optional; env can be set by shell
}

const http = require("http");
const fs = require("fs");
const path = require("path");

const request = require("../dist/index").default;
const { createDefaultOrchestrateSolver, OrchestrateChallengeError } = require("../dist/index");

const PORT_MIN = 8765;
const PORT_MAX = 8775;
const TEST_DIR = path.join(__dirname);

function captureDebug(fn) {
    const debugLog = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    const originalError = console.error;
    console.warn = (...args) => {
        debugLog.push({ t: "warn", ts: new Date().toISOString(), m: args.map(String).join(" ") });
        originalWarn.apply(console, args);
    };
    console.log = (...args) => {
        debugLog.push({ t: "log", ts: new Date().toISOString(), m: args.map(String).join(" ") });
        originalLog.apply(console, args);
    };
    console.error = (...args) => {
        debugLog.push({ t: "error", ts: new Date().toISOString(), m: args.map(String).join(" ") });
        originalError.apply(console, args);
    };
    try {
        return fn().then((result) => ({ debugLog, result }));
    } finally {
        console.warn = originalWarn;
        console.log = originalLog;
        console.error = originalError;
    }
}

function truncate(str, maxLen = 8000) {
    if (typeof str !== "string") str = String(str);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "\n\n... [truncated, total " + str.length + " chars]";
}

async function handleFetch(body) {
    const url = body.url;
    const method = (body.method || "GET").toUpperCase();
    const formData = body.formData || null;
    const usePuppeteer = !!body.usePuppeteer;

    if (!url || typeof url !== "string") {
        return {
            success: false,
            errorMessage: "Missing or invalid 'url' in request body",
            debugLog: [],
        };
    }

    const params = {
        challengesToSolve: 3,
        ...(usePuppeteer && {
            solveOrchestrateChallenge: createDefaultOrchestrateSolver({
                headless: true,
                timeout: 35000,
            }),
        }),
    };

    const options = {
        uri: url,
        method,
        ...(formData && Object.keys(formData).length > 0 && { formData }),
    };

    const { debugLog, result } = await captureDebug(async () => {
        request.debug = true;
        try {
            const res = await request(options, params);
            return {
                success: true,
                statusCode: res.statusCode,
                bodyLength: res.body ? (typeof res.body === "string" ? res.body.length : res.body.byteLength || res.body.length) : 0,
                bodyPreview: truncate(typeof res.body === "string" ? res.body : String(res.body), 6000),
                headers: res.headers ? JSON.stringify(res.headers, null, 2) : "{}",
                isCloudflare: res.isCloudflare,
            };
        } catch (err) {
            const body = err.response?.body;
            const bodyPreview =
                body != null
                    ? truncate(typeof body === "string" ? body : String(body), 4000)
                    : undefined;
            return {
                success: false,
                errorName: err.name,
                errorMessage: err.message,
                errorType: err.errorType,
                statusCode: err.response?.statusCode,
                bodyPreview,
                debugLog: [],
            };
        } finally {
            request.debug = false;
        }
    });

    if (result.success) {
        return { ...result, debugLog };
    }
    return { ...result, debugLog };
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".json": "application/json",
    ".css": "text/css",
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    if (req.method === "POST" && pathname === "/fetch") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
            const parsed = JSON.parse(body);
            const result = await handleFetch(parsed);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result, null, 2));
        } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    success: false,
                    errorMessage: String(e.message),
                    debugLog: [],
                })
            );
        }
        return;
    }

    const filePath = path.join(TEST_DIR, pathname);
    if (!filePath.startsWith(TEST_DIR)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
    });
});

function runOnce() {
    const useSolver = process.env.USE_PUPPETEER === "1";
    const url =
        process.argv[3] ||
        process.env.TEST_URL ||
        "https://nowsecure.nl";
    const params = {
        challengesToSolve: 3,
        ...(useSolver && {
            solveOrchestrateChallenge: createDefaultOrchestrateSolver({
                headless: true,
                timeout: 45000,
            }),
        }),
    };
    return request({ uri: url, method: "GET" }, params).then((res) => {
        console.log("Status:", res.statusCode);
        console.log(res.body);
    });
}

if (process.argv[2] === "run") {
    runOnce()
        .then(() => process.exit(0))
        .catch((err) => {
            if (err instanceof OrchestrateChallengeError) {
                console.error(
                    "Orchestrate challenge encountered. Run with USE_PUPPETEER=1 (and install puppeteer or playwright) to solve it."
                );
                console.error(err.message);
            } else {
                console.error(err);
            }
            process.exit(1);
        });
    return;
}

let nextPort = parseInt(process.env.PORT, 10) || PORT_MIN;

function tryListen() {
    if (nextPort > PORT_MAX) {
        console.error(
            "No available port in range " + PORT_MIN + "–" + PORT_MAX + ". Kill the process using port " + PORT_MIN + " or set PORT env."
        );
        process.exit(1);
    }
    const port = nextPort;
    nextPort += 1;
    server.listen(port, () => {
        console.log("CloudScraper-TS test server at http://localhost:" + port);
        console.log("Open that URL in a browser and use the buttons to test.");
    });
}

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.warn("Port " + (nextPort - 1) + " in use, trying " + nextPort + "...");
        tryListen();
    } else {
        throw err;
    }
});

tryListen();
