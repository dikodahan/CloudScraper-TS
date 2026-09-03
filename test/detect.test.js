const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { isOrchestrateChallenge, isSucuriRedirect, isAccessDeniedPage, extractSucuriCookie, shouldHandleChallenge, setCookiesOnJar, AccessDeniedError, OrchestrateLoopError, FlareSolverrError, createFlareSolverrOrchestrateSolver } = require("../dist/index");

const FIXTURES = path.join(__dirname, "fixtures");

function loadFixture(name) {
    const body = fs.readFileSync(path.join(FIXTURES, name + ".html"), "utf8");
    const headers = JSON.parse(fs.readFileSync(path.join(FIXTURES, name + ".headers.json"), "utf8"));
    return { body, ...headers };
}

test("plain-200 is not an orchestrate or sucuri challenge", () => {
    const f = loadFixture("plain-200");
    assert.equal(isOrchestrateChallenge(f, f.body), false);
    assert.equal(isSucuriRedirect(f.body), false);
    assert.equal(isAccessDeniedPage(f.body), false);
});

test("orchestrate-challenge fixture is detected", () => {
    const f = loadFixture("orchestrate-challenge");
    assert.equal(isOrchestrateChallenge(f, f.body), true);
});

test("access-denied fixture is a block page (not orchestrate)", () => {
    const f = loadFixture("access-denied");
    assert.equal(isAccessDeniedPage(f.body), true);
    assert.equal(isOrchestrateChallenge(f, f.body), false);
});

test("ddos-guard fixture is treated as an orchestrate-style challenge", () => {
    const f = loadFixture("ddos-guard");
    assert.equal(shouldHandleChallenge(f, f.body), true);
    assert.equal(isOrchestrateChallenge(f, f.body), true);
    assert.equal(isAccessDeniedPage(f.body), false);
});

test("403 HTML with challenge-platform is handled even without server: cloudflare", () => {
    const body = '<html><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1"></script></html>';
    const response = { statusCode: 403, headers: { "content-type": "text/html" } };
    assert.equal(shouldHandleChallenge(response, body), true);
    assert.equal(isOrchestrateChallenge(response, body), true);
});

test("cf-mitigated: challenge is handled without Just a moment title", () => {
    const body = "<html><body>wait</body></html>";
    const response = { statusCode: 403, headers: { "cf-mitigated": "challenge", "content-type": "text/html" } };
    assert.equal(shouldHandleChallenge(response, body), true);
    assert.equal(isOrchestrateChallenge(response, body), true);
});

test("sucuri-redirect fixture extracts cookie without eval", () => {
    const f = loadFixture("sucuri-redirect");
    assert.equal(isSucuriRedirect(f.body), true);
    const cookie = extractSucuriCookie(f.body);
    assert.ok(cookie);
    assert.match(cookie, /sucuri_cloudproxy_uuid_abc=deadbeef/);
});

test("orchestrate solver failure writes HTML + error dump to debugDir", async () => {
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-debug-"));
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const requester = async () => ({
        url: "https://example.com/",
        statusCode: f.statusCode,
        headers: f.headers,
        body: Buffer.from(f.body),
    });
    await assert.rejects(
        () =>
            request(
                { uri: "https://example.com/" },
                {
                    requester,
                    debugDir: dir,
                    solveOrchestrateChallenge: async () => {
                        throw new Error("forced solver failure");
                    },
                },
            ),
        /forced solver failure/,
    );
    const stamps = fs.readdirSync(dir);
    assert.ok(stamps.length > 0, "expected a dump subdirectory");
    const dump = path.join(dir, stamps[0]);
    assert.ok(fs.existsSync(path.join(dump, "challenge.html")));
    assert.ok(fs.existsSync(path.join(dump, "error.txt")));
    fs.rmSync(dir, { recursive: true, force: true });
});

test("access-denied fixture throws AccessDeniedError and does not call the solver", async () => {
    const f = loadFixture("access-denied");
    const request = require("../dist/index").default;
    let solverCalls = 0;
    await assert.rejects(
        () =>
            request(
                { uri: "https://example.com/" },
                {
                    requester: async () => ({
                        url: "https://example.com/",
                        statusCode: f.statusCode,
                        headers: f.headers,
                        body: Buffer.from(f.body),
                    }),
                    solveOrchestrateChallenge: async () => {
                        solverCalls++;
                    },
                },
            ),
        (err) => err instanceof AccessDeniedError && solverCalls === 0,
    );
});

test("solver that never sets cf_clearance terminates with OrchestrateLoopError", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    let solverCalls = 0;
    const started = Date.now();
    await assert.rejects(
        () =>
            request(
                { uri: "https://example.com/" },
                {
                    challengesToSolve: 2,
                    requester: async () => ({
                        url: "https://example.com/",
                        statusCode: f.statusCode,
                        headers: f.headers,
                        body: Buffer.from(f.body),
                    }),
                    solveOrchestrateChallenge: async () => {
                        solverCalls++;
                    },
                },
            ),
        (err) => err instanceof OrchestrateLoopError,
    );
    assert.equal(solverCalls, 2);
    assert.ok(Date.now() - started < 5000, "loop did not terminate promptly");
});

test("Host placeholder is replaced and headers are lowercased", async () => {
    const request = require("../dist/index").default;
    let captured;
    await request(
        { uri: "https://example.com/x" },
        {
            headers: { Host: "__CLOUDSCRAPER_HOST__", "User-Agent": "test-ua" },
            requester: async (_url, opts) => {
                captured = opts.headers;
                return { url: "https://example.com/x", statusCode: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("ok") };
            },
        },
    );
    assert.equal(captured.host, "example.com");
    assert.equal(captured.Host, undefined);
    assert.equal(captured["user-agent"], "test-ua");
});

test("setCookiesOnJar accepts expiry, skips session -1, requires cf_clearance", async () => {
    const { CookieJar } = require("tough-cookie");
    const jar = new CookieJar();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await setCookiesOnJar(jar, "https://example.com/", [
        { name: "sid", value: "1", path: "/", expires: -1 },
        { name: "cf_clearance", value: "tok", path: "/", expiry: future, sameSite: "None", secure: true },
    ]);
    const cookies = await jar.getCookies("https://example.com/");
    const clearance = cookies.find((c) => c.key === "cf_clearance");
    assert.ok(clearance);
    const sid = cookies.find((c) => c.key === "sid");
    assert.ok(sid);
    assert.ok(sid.expires === "Infinity" || sid.expires === Infinity);

    const empty = new CookieJar();
    await assert.rejects(() => setCookiesOnJar(empty, "https://example.com/", [{ name: "other", value: "x", path: "/" }]), /cf_clearance/);
});

test("SolverResult pins userAgent on the follow-up request", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    let calls = 0;
    let secondHeaders;
    const res = await request(
        { uri: "https://example.com/" },
        {
            requester: async (_url, opts) => {
                calls++;
                if (calls === 1) {
                    return { url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) };
                }
                secondHeaders = opts.headers;
                return { url: "https://example.com/", statusCode: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>ok</html>") };
            },
            solveOrchestrateChallenge: async () => ({
                cookies: [{ name: "cf_clearance", value: "tok", path: "/" }],
                userAgent: "Solved-UA/1.0",
            }),
        },
    );
    assert.equal(calls, 2);
    assert.equal(secondHeaders["user-agent"], "Solved-UA/1.0");
    assert.match(String(res.body), /ok/);
});

test("SolverResult body on GET skips the follow-up request", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    let calls = 0;
    const res = await request(
        { uri: "https://example.com/", method: "GET" },
        {
            requester: async () => {
                calls++;
                return { url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) };
            },
            solveOrchestrateChallenge: async () => ({
                // A stealth browser may reach the destination without Cloudflare
                // issuing a persistent clearance cookie.
                cookies: [{ name: "session", value: "ok", path: "/" }],
                userAgent: "Solved-UA/1.0",
                body: "<html>solved-page</html>",
                status: 200,
            }),
        },
    );
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    assert.match(String(res.body), /solved-page/);
});

function mockFetch(handler) {
    const orig = global.fetch;
    const cmds = [];
    global.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        cmds.push(body);
        return handler(body);
    };
    return {
        cmds,
        restore() {
            global.fetch = orig;
        },
    };
}

function jsonOk(data) {
    return { ok: true, statusText: "OK", json: async () => data };
}

function flareOk(extra) {
    return jsonOk({
        status: "ok",
        solution: {
            cookies: [{ name: "cf_clearance", value: "tok", path: "/" }],
            userAgent: "FS-UA",
            response: "<html>from-flaresolverr</html>",
            status: 200,
            url: "https://example.com/",
            ...extra,
        },
    });
}

test("FlareSolverr GET sends request.get and skips the follow-up request", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const mock = mockFetch(() => flareOk());
    let calls = 0;
    try {
        const res = await request(
            { uri: "https://example.com/" },
            {
                requester: async () => {
                    calls++;
                    return { url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) };
                },
                solveOrchestrateChallenge: createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: false }),
            },
        );
        assert.equal(calls, 1);
        assert.match(String(res.body), /from-flaresolverr/);
        assert.equal(res.statusCode, 200);
        assert.equal(mock.cmds.length, 1);
        assert.equal(mock.cmds[0].cmd, "request.get");
        assert.equal(mock.cmds[0].url, "https://example.com/");
        assert.equal(mock.cmds[0].returnOnlyCookies, undefined);
        assert.equal(mock.cmds[0].session, undefined);
    } finally {
        mock.restore();
    }
});

test("FlareSolverr POST sends request.post with postData then retries", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const mock = mockFetch(() => flareOk());
    let calls = 0;
    let secondOpts;
    try {
        const res = await request(
            { uri: "https://example.com/", method: "POST", form: { a: "1", b: "two" } },
            {
                requester: async (_url, opts) => {
                    calls++;
                    if (calls === 1) {
                        return { url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) };
                    }
                    secondOpts = opts;
                    return { url: "https://example.com/", statusCode: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>posted</html>") };
                },
                solveOrchestrateChallenge: createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: false }),
            },
        );
        assert.equal(calls, 2);
        assert.match(String(res.body), /posted/);
        assert.equal(mock.cmds[0].cmd, "request.post");
        assert.equal(mock.cmds[0].postData, "a=1&b=two");
        assert.equal(mock.cmds[0].returnOnlyCookies, true);
        assert.equal(secondOpts.headers["user-agent"], "FS-UA");
        assert.equal(secondOpts.form.a, "1");
    } finally {
        mock.restore();
    }
});

test("FlareSolverr error payload throws FlareSolverrError", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const mock = mockFetch(() => jsonOk({ status: "error", message: "Error: Challenge expired" }));
    try {
        await assert.rejects(
            () =>
                request(
                    { uri: "https://example.com/" },
                    {
                        requester: async () => ({ url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) }),
                        solveOrchestrateChallenge: createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: false }),
                    },
                ),
            (err) => err instanceof FlareSolverrError && err.errorType === 8 && /Challenge expired/.test(err.message),
        );
    } finally {
        mock.restore();
    }
});

test("FlareSolverr reuses a named session and honors maxTimeout/proxy", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const mock = mockFetch((body) => {
        if (body.cmd === "sessions.create") return jsonOk({ status: "ok", message: "Session created successfully.", session: body.session });
        return flareOk();
    });
    const solver = createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: "jar-a", maxTimeout: 12000, sessionTtlMinutes: 7 });
    try {
        const params = {
            proxy: "http://127.0.0.1:8888",
            requester: async () => ({ url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) }),
            solveOrchestrateChallenge: solver,
        };
        await request({ uri: "https://example.com/" }, params);
        await request({ uri: "https://example.com/" }, params);
        const creates = mock.cmds.filter((c) => c.cmd === "sessions.create");
        const gets = mock.cmds.filter((c) => c.cmd === "request.get");
        assert.equal(creates.length, 1);
        assert.equal(creates[0].session, "jar-a");
        assert.deepEqual(creates[0].proxy, { url: "http://127.0.0.1:8888" });
        assert.equal(gets.length, 2);
        assert.equal(gets[0].session, "jar-a");
        assert.equal(gets[0].session_ttl_minutes, 7);
        assert.equal(gets[0].maxTimeout, 12000);
        assert.equal(gets[0].proxy, undefined);
    } finally {
        mock.restore();
    }
});

test("FlareSolverr requests a screenshot when debugDir is set", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const mock = mockFetch(() => flareOk());
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-fs-"));
    try {
        await request(
            { uri: "https://example.com/" },
            {
                debugDir: dir,
                requester: async () => ({ url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) }),
                solveOrchestrateChallenge: createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: false }),
            },
        );
        assert.equal(mock.cmds[0].returnScreenshot, true);
    } finally {
        mock.restore();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("FlareSolverr forwards waitInSeconds, jar cookies, and proxy auth on sessions.create", async () => {
    const f = loadFixture("orchestrate-challenge");
    const request = require("../dist/index").default;
    const { CookieJar } = require("tough-cookie");
    const mock = mockFetch((body) => {
        if (body.cmd === "sessions.create") return jsonOk({ status: "ok", message: "Session created successfully.", session: body.session });
        return flareOk({ turnstile_token: "tok-cf" });
    });
    const jar = new CookieJar();
    await jar.setCookie("sid=abc; Path=/", "https://example.com/");
    try {
        await request(
            { uri: "https://example.com/" },
            {
                cookieJar: jar,
                proxy: "http://user:s3cret@127.0.0.1:8888",
                requester: async () => ({ url: "https://example.com/", statusCode: f.statusCode, headers: f.headers, body: Buffer.from(f.body) }),
                solveOrchestrateChallenge: createFlareSolverrOrchestrateSolver("http://flaresolverr/v1", { session: "auth-proxy", waitInSeconds: 2, maxTimeout: 9000 }),
            },
        );
        const create = mock.cmds.find((c) => c.cmd === "sessions.create");
        const get = mock.cmds.find((c) => c.cmd === "request.get");
        assert.deepEqual(create.proxy, { url: "http://127.0.0.1:8888/", username: "user", password: "s3cret" });
        assert.equal(get.waitInSeconds, 2);
        assert.ok(get.cookies.some((c) => c.name === "sid" && c.value === "abc"));
    } finally {
        mock.restore();
    }
});

test("destroyFlareSolverrSession sends sessions.destroy", async () => {
    const { destroyFlareSolverrSession } = require("../dist/index");
    const mock = mockFetch(() => jsonOk({ status: "ok", message: "The session has been removed." }));
    try {
        await destroyFlareSolverrSession("http://flaresolverr/v1", "jar-a");
        assert.equal(mock.cmds[0].cmd, "sessions.destroy");
        assert.equal(mock.cmds[0].session, "jar-a");
    } finally {
        mock.restore();
    }
});
