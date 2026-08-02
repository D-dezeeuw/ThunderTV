#!/usr/bin/env node
// Headless end-to-end smoke test for the Electron shell — the layer that
// catches "the desktop app doesn't start" in an environment with no screen
// and no human to look at one.
//
// **The trap this is designed around: a broken Electron app does not
// exit.** The two packaging bugs that prompted it both left a live process
// — one parked on Electron's "A JavaScript error occurred in the main
// process" dialog, one holding an empty window open. `run it and check the
// exit code` passes on a completely dead app, so every assertion here is a
// *positive* signal read out of the live renderer over CDP. The converse
// trap is just as easy: see `.claude/skills/electron-testing/` for why
// asserting DOM *absence* is usually the harness being wrong.
//
// Usage — no args smokes desktop/ via its local electron; `--packaged
// <binary>` smokes a built artifact; `--json` prints a machine-readable
// report; `--keep-profile` keeps the temp user-data dir.
//
// Exit 0 = every check passed. Exit 1 = at least one failed; the report
// names which, and a screenshot of whatever was actually on screen is
// written to release/smoke/ for a human (or an agent with an image-capable
// Read) to look at.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpSession, fetchJson, sleep, startDisplay, waitFor } from './cdp-client.mjs';
import { checkBridge, checkHostServices } from './smoke-desktop-bridge.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const keepProfile = args.includes('--keep-profile');
const packagedIndex = args.indexOf('--packaged');
const packagedBinary = packagedIndex === -1 ? null : args[packagedIndex + 1];
const timeoutIndex = args.indexOf('--timeout');
const BUDGET_MS = timeoutIndex === -1 ? 60_000 : Number(args[timeoutIndex + 1]);

const screenshotDir = path.join(repoRoot, 'release', 'smoke');
const screenshotPath = path.join(screenshotDir, packagedBinary ? 'packaged.png' : 'unpackaged.png');

/** Every check the run performed, in order, with its verdict. */
const checks = [];
const record = (name, ok, detail) => {
    checks.push({ name, ok, detail, fatal: true });
    if (!jsonOnly) console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Reported, never fatal. For app-level health that this harness can see but
 * that isn't the desktop shell's fault — anything reproducible against the
 * plain web build belongs here, or the desktop smoke ends up permanently
 * red for a bug it did not cause and cannot fix.
 */
const observe = (name, ok, detail) => {
    checks.push({ name, ok, detail, fatal: false });
    if (!jsonOnly) console.log(`${ok ? '  ok  ' : ' note ' } ${name}${detail ? ` — ${detail}` : ''}`);
};

const log = (msg) => {
    if (!jsonOnly) console.log(msg);
};

/**
 * Main-process death rattles. Electron prints these and then *keeps
 * running*, so the log is the only place they exist — hence scanning for
 * them rather than waiting on an exit code that never comes.
 */
const FATAL_PATTERNS = [
    /A JavaScript error occurred in the main process/,
    /ERR_MODULE_NOT_FOUND/,
    /ERR_FILE_NOT_FOUND/,
    /Uncaught Exception/,
    /UnhandledPromiseRejection/,
    /Cannot find module/,
];

/**
 * Chromium noise that is expected in a container and says nothing about
 * the app: no D-Bus, no GPU, no audio device. Filtered so a real error
 * stays findable in the captured log.
 */
const NOISE_PATTERNS = [
    /dbus/i,
    /viz_main_impl/,
    /GpuControl/,
    /StagingBuffer/,
    /gpu_process_host/i,
    /Failed to shutdown/,
    /NODE_OPTIONs are not supported/,
    /libva|vaapi|GLX|swiftshader|EGL/i,
];

/**
 * Electron writes the port it actually bound into `DevToolsActivePort` in
 * the user-data dir. Reading it beats picking a free port ourselves and
 * racing whatever else on the machine wanted it.
 */
function readDevToolsPort(userDataDir) {
    try {
        const [port] = fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n');
        const parsed = Number(port);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
        return null;
    }
}

async function main() {
    const display = startDisplay(log);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thundertv-smoke-'));
    log(`profile: ${userDataDir} (fresh — never the developer's real one)`);

    const launchArgs = [
        // No sandbox: unprivileged containers can't create the namespaces
        // Chromium's sandbox needs. Acceptable here and nowhere else — this
        // is a throwaway process loading only this app's own file:// page.
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDir}`,
        // Port 0 = let Electron pick; it reports back via DevToolsActivePort.
        '--remote-debugging-port=0',
    ];

    const [command, commandArgs, cwd] = packagedBinary
        ? [path.resolve(packagedBinary), launchArgs, repoRoot]
        : [
              path.join(repoRoot, 'desktop', 'node_modules', '.bin', 'electron'),
              ['.', ...launchArgs],
              path.join(repoRoot, 'desktop'),
          ];

    if (!fs.existsSync(command)) {
        throw new Error(
            `smoke-desktop: ${command} not found. ` +
                (packagedBinary ? 'Build it first (cd desktop && npm run package:linux).' : 'Run `npm ci` in desktop/.'),
        );
    }

    log(`launch: ${command} ${commandArgs.join(' ')}`);
    const child = spawn(command, commandArgs, {
        cwd,
        env: { ...process.env, DISPLAY: display.display },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const fatals = [];
    const onChunk = (buf) => {
        const text = String(buf);
        output += text;
        for (const line of text.split('\n')) {
            if (NOISE_PATTERNS.some((p) => p.test(line))) continue;
            if (FATAL_PATTERNS.some((p) => p.test(line))) fatals.push(line.trim());
        }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    let exited = null;
    child.on('exit', (code, signal) => {
        exited = signal ?? code;
    });

    const cleanup = () => {
        try {
            child.kill('SIGKILL');
        } catch {
            // Already dead.
        }
        display.stop();
        if (!keepProfile) fs.rmSync(userDataDir, { recursive: true, force: true });
    };

    try {
        // ---- 1. the main process survives its own module graph -----------
        const port = await waitFor(() => (fatals.length > 0 || exited !== null ? -1 : readDevToolsPort(userDataDir)), BUDGET_MS);

        record(
            'main process starts without a fatal error',
            fatals.length === 0 && exited === null,
            fatals[0] ?? (exited !== null ? `process exited early (${String(exited)})` : ''),
        );
        if (fatals.length > 0 || exited !== null) return;

        record('devtools endpoint is reachable', typeof port === 'number' && port > 0, port ? `port ${String(port)}` : 'never appeared');
        if (typeof port !== 'number' || port <= 0) return;

        // ---- 2. a real app window exists ---------------------------------
        // Splash and app are both `page` targets; the app is the one loading
        // the built index.html. Requiring it by URL is what makes "the
        // splash is up but the app never loaded" a failure rather than a pass.
        const target = await waitFor(async () => {
            const list = await fetchJson(`http://127.0.0.1:${String(port)}/json/list`);
            if (!Array.isArray(list)) return null;
            return list.find((t) => t.type === 'page' && /index\.html$/.test(String(t.url).split('#')[0])) ?? null;
        }, BUDGET_MS);

        record('app window loaded the built index.html', Boolean(target), target ? target.url.replace(repoRoot, '') : 'no such page target');
        if (!target) return;

        // ---- 3. the renderer is actually alive ---------------------------
        const cdp = await CdpSession.connect(target.webSocketDebuggerUrl);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Log.enable');
        // Deliberately no `Page.reload` to capture boot-time logs: reloading
        // tears down the execution context this session evaluates in, and
        // every subsequent `Runtime.evaluate` then hangs until its timeout.
        // Attaching post-boot costs the first few console lines; hanging
        // costs the whole run.
        const ready = await waitFor(
            () => cdp.evaluate('return document.readyState === "complete";').catch(() => false),
            BUDGET_MS,
        );
        record('renderer reaches readyState=complete', Boolean(ready));

        // Boot is async (storage probe, sources load); give it room to settle
        // before asking whether the UI mounted.
        await sleep(3000);

        // ---- 4. the app booted, not just the HTML -------------------------
        // An unbound Spektrum template still shows its literal `{{ … }}`
        // mustaches. Their absence is the cheapest honest proof that the
        // vendored Spektrum runtime loaded and bound the DOM — exactly what
        // `package-target.mjs`'s import rewrite can silently break in a
        // packaged build.
        const dom = await cdp.evaluate(`
            const app = document.querySelector('#app');
            return {
                hasApp: Boolean(app),
                childCount: app ? app.childElementCount : 0,
                unboundMustaches: (document.body.innerText.match(/\\{\\{[^}]+\\}\\}/g) || []).slice(0, 3),
                // Spektrum's data-if sets style.display, it does not unmount
                // — so presence in the DOM proves nothing and asking for
                // absence is a permanently-failing assertion. Ask what a
                // viewer would see instead.
                bootOverlayHidden: (() => {
                    const el = document.querySelector('[data-testid="boot-overlay"]');
                    return !el || getComputedStyle(el).display === 'none';
                })(),
                title: document.title,
            };
        `);
        record('#app is present and populated', dom.hasApp && dom.childCount > 0, `${String(dom.childCount)} children`);
        record('Spektrum bound the template', dom.unboundMustaches.length === 0, dom.unboundMustaches.join(' '));
        // Fatal, and worth being fatal: an overlay still painted after boot
        // means the app is sitting behind a full-screen scrim, which is
        // indistinguishable from "the app never started" to whoever is
        // looking at it.
        record('boot overlay cleared', dom.bootOverlayHidden, dom.bootOverlayHidden ? '' : 'still visible after boot');

        // ---- 5. the preload bridge matches its declared contract ----------
        const origins = await checkBridge(cdp, record);

        // ---- 6. what the renderer logged ----------------------------------
        // Snapshotted *before* the proxy probe below, which deliberately
        // provokes an HTTP 400 and would otherwise show up as a renderer
        // error of our own making.
        //
        // Split by blame, because the two halves mean different things:
        // a failed *resource load* is what a wrong path in a packaged build
        // looks like from the renderer, and this harness exists to catch
        // that — while an app-level `TypeError` is a bug the desktop build
        // merely inherits from the same `dist/` the web deploy ships.
        // Failing the desktop smoke for the latter would make it red for a
        // reason no change to `desktop/` could ever fix.
        const loadFailures = cdp.errors.filter((e) => /Failed to load resource|Refused to (load|execute)|net::ERR_/.test(e));
        const appErrors = cdp.errors.filter((e) => !loadFailures.includes(e));
        record('no failed resource loads in the renderer', loadFailures.length === 0, loadFailures.slice(0, 3).join(' | '));
        record('no main-process fatals during the run', fatals.length === 0, fatals[0] ?? '');
        observe('no app-level renderer errors', appErrors.length === 0, appErrors.slice(0, 2).join(' | '));

        // The two servers the main process embeds — the embedded proxy is
        // the whole reason the desktop build reports `corsUnrestricted:
        // true`, and the transcoder is the whole reason a film with AC-3
        // audio has sound here. Probed last, for the reason given above.
        await checkHostServices(cdp, record, observe, origins);

        // ---- 7. leave something a human/agent can look at ------------------
        try {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
            fs.mkdirSync(screenshotDir, { recursive: true });
            fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
            log(`screenshot: ${screenshotPath}`);
        } catch (err) {
            log(`screenshot: failed (${String(err)})`);
        }

        cdp.close();
    } finally {
        cleanup();
    }

    return output;
}

const started = Date.now();
let capturedOutput = '';
try {
    capturedOutput = (await main()) ?? '';
} catch (err) {
    record('smoke harness ran to completion', false, err instanceof Error ? err.message : String(err));
}

const failed = checks.filter((c) => !c.ok && c.fatal);
const noted = checks.filter((c) => !c.ok && !c.fatal);
const report = {
    target: packagedBinary ? `packaged:${packagedBinary}` : 'unpackaged:desktop/',
    passed: checks.filter((c) => c.ok).length,
    failed: failed.length,
    noted: noted.length,
    durationMs: Date.now() - started,
    screenshot: fs.existsSync(screenshotPath) ? path.relative(repoRoot, screenshotPath) : null,
    checks,
};

if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log('');
    if (noted.length > 0) {
        console.log(`smoke-desktop: ${String(noted.length)} non-fatal observation(s):`);
        for (const c of noted) console.log(`  ~ ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
        console.log('');
    }
    if (failed.length === 0) {
        console.log(`smoke-desktop: OK — ${String(report.passed)} checks passed in ${String(report.durationMs)}ms`);
    } else {
        console.error(`smoke-desktop: ${String(failed.length)} check(s) FAILED:`);
        for (const c of failed) console.error(`  - ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
        const tail = capturedOutput.split('\n').filter((l) => l.trim() && !NOISE_PATTERNS.some((p) => p.test(l)));
        if (tail.length > 0) {
            console.error('\nApp output (noise filtered):');
            for (const line of tail.slice(-25)) console.error(`  ${line}`);
        }
    }
}

process.exit(failed.length === 0 ? 0 : 1);
