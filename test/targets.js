/**
 * Live target matrix (Phase 0). Prints a per-target pass/fail table.
 * Run: node test/targets.js
 */
try {
    require("dotenv").config();
} catch (_) {
    /* optional */
}

const fs = require("fs");
const path = require("path");
const request = require("../dist/index").default;
const { createDefaultOrchestrateSolver } = require("../dist/index");

const DEBUG_DIR = path.join(__dirname, "debug-output");

const TARGETS = [
    {
        id: "plain-200",
        url: "https://example.com/",
        expect: "status200",
        solver: false,
    },
    {
        id: "cf-trace",
        url: "https://www.cloudflare.com/cdn-cgi/trace",
        expect: "status200",
        solver: false,
    },
    {
        id: "cf-homepage",
        url: "https://www.cloudflare.com/",
        expect: "status200",
        solver: false,
    },
    {
        id: "nowsecure-orchestrate",
        url: "https://nowsecure.nl/",
        expect: "status200-or-orchestrate",
        solver: true,
    },
    {
        id: "forced-solver-failure",
        url: "https://example.com/",
        expect: "debug-dump",
        solver: "force-fail",
    },
];

function pad(s, n) {
    s = String(s);
    return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function runTarget(t) {
    const started = Date.now();
    if (t.expect === "debug-dump") {
        fs.rmSync(DEBUG_DIR, { recursive: true, force: true });
        const html = fs.readFileSync(path.join(__dirname, "fixtures", "orchestrate-challenge.html"));
        const hdr = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "orchestrate-challenge.headers.json"), "utf8"));
        const requester = async () => ({
            url: t.url,
            statusCode: hdr.statusCode,
            headers: hdr.headers,
            body: html,
        });
        try {
            await request(
                { uri: t.url, timeout: 5000 },
                {
                    requester,
                    challengesToSolve: 1,
                    debugDir: DEBUG_DIR,
                    solveOrchestrateChallenge: async () => {
                        throw new Error("forced solver failure");
                    },
                },
            );
            return { id: t.id, ok: false, detail: "expected solver to fail", ms: Date.now() - started };
        } catch (err) {
            const dumped = fs.existsSync(DEBUG_DIR) && fs.readdirSync(DEBUG_DIR).length > 0;
            let hasHtml = false;
            if (dumped) {
                const stamp = fs.readdirSync(DEBUG_DIR)[0];
                hasHtml = fs.existsSync(path.join(DEBUG_DIR, stamp, "challenge.html"));
            }
            if (dumped && hasHtml) {
                return { id: t.id, ok: true, detail: "dump written to test/debug-output", ms: Date.now() - started };
            }
            return { id: t.id, ok: false, detail: "no debug dump (" + (err && err.message) + ")", ms: Date.now() - started };
        }
    }

    const params = {
        challengesToSolve: 3,
        timeout: 30000,
        ...(t.solver
            ? {
                  debugDir: DEBUG_DIR,
                  solveOrchestrateChallenge: createDefaultOrchestrateSolver({
                      headless: true,
                      timeout: 45000,
                      debugDir: DEBUG_DIR,
                  }),
              }
            : {}),
    };

    try {
        const res = await request({ uri: t.url, timeout: 30000 }, params);
        const ok = res && res.statusCode >= 200 && res.statusCode < 400;
        return { id: t.id, ok, detail: "HTTP " + (res && res.statusCode), ms: Date.now() - started };
    } catch (err) {
        const name = err && err.name ? err.name : "Error";
        if (t.expect === "status200-or-orchestrate" && name === "OrchestrateChallengeError") {
            return { id: t.id, ok: true, detail: "orchestrate (no solver clearance)", ms: Date.now() - started };
        }
        return { id: t.id, ok: false, detail: name + ": " + (err && err.message ? err.message.split("\n")[0] : err), ms: Date.now() - started };
    }
}

async function main() {
    const rows = [];
    for (const t of TARGETS) {
        process.stdout.write("→ " + t.id + " … ");
        const row = await runTarget(t);
        rows.push(row);
        console.log(row.ok ? "pass" : "fail");
    }

    console.log("");
    console.log(pad("target", 28) + pad("result", 8) + pad("ms", 8) + "detail");
    console.log("-".repeat(80));
    let failed = 0;
    for (const r of rows) {
        if (!r.ok) failed++;
        console.log(pad(r.id, 28) + pad(r.ok ? "PASS" : "FAIL", 8) + pad(r.ms, 8) + r.detail);
    }
    console.log("-".repeat(80));
    console.log(rows.length - failed + " passed, " + failed + " failed");
    process.exit(failed ? 1 : 0);
}

main();
