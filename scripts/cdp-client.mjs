#!/usr/bin/env node
/**
 * The reusable half of the desktop smoke test: a headless display, and a
 * minimal Chrome DevTools Protocol client.
 *
 * Split out of `scripts/smoke-desktop.mjs` because none of it is
 * ThunderTV-specific — it is the generic "drive a real Electron/Chromium
 * window from Node with no dependencies" machinery, and the smoke test
 * reads better as just its list of assertions.
 *
 * No Playwright, no puppeteer, no `ws` package: Node 22 ships a global
 * `WebSocket`, and CDP over a raw socket is a few dozen lines. That matters
 * for an agent sandbox, where every added dependency is another install
 * that can fail behind a proxy.
 */
import { spawn, spawnSync } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for `probe()` to return truthy, or resolves `null` at the deadline. */
export async function waitFor(probe, deadlineMs, intervalMs = 250) {
    const stopAt = Date.now() + deadlineMs;
    for (;;) {
        const value = await probe();
        if (value) return value;
        if (Date.now() > stopAt) return null;
        await sleep(intervalMs);
    }
}

/**
 * A display, one way or another. Electron has no `--headless` of its own —
 * it needs a real X server — so a machine without `DISPLAY` (every CI
 * runner and every agent sandbox) gets an Xvfb of its own here. Spawned
 * directly rather than via `xvfb-run` so this script owns the PID and can
 * guarantee it dies with us.
 */
export function startDisplay(log = () => {}) {
    if (process.env.DISPLAY) {
        log(`display: reusing ${process.env.DISPLAY}`);
        return { display: process.env.DISPLAY, stop: () => {} };
    }
    if (!spawnSync('which', ['Xvfb']).status === 0) {
        throw new Error('smoke-desktop: no DISPLAY and no Xvfb on PATH — install xvfb or run under a desktop session.');
    }
    // A high, unlikely-to-collide display number; `-nolisten tcp` because
    // nothing should be able to reach this X server but us.
    const display = `:${String(90 + Math.floor(Math.random() * 9))}`;
    const proc = spawn('Xvfb', [display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
        stdio: 'ignore',
        detached: true,
    });
    proc.unref();
    log(`display: started Xvfb on ${display} (pid ${String(proc.pid)})`);
    return {
        display,
        stop: () => {
            try {
                process.kill(proc.pid, 'SIGKILL');
            } catch {
                // Already gone.
            }
        },
    };
}

/** Minimal CDP client over Node 22's built-in WebSocket — no dependency needed. */
export class CdpSession {
    #ws;
    #nextId = 1;
    #pending = new Map();
    /** Console errors and page exceptions seen since `Runtime.enable`. */
    errors = [];

    constructor(ws) {
        this.#ws = ws;
        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(String(event.data));
            if (msg.id !== undefined) {
                const entry = this.#pending.get(msg.id);
                if (!entry) return;
                this.#pending.delete(msg.id);
                if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
                else entry.resolve(msg.result);
                return;
            }
            if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                this.errors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
            }
            if (msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails;
                this.errors.push(d.exception?.description ?? d.text);
            }
            // Browser-level errors, which `console` never sees: a blocked
            // CSP load, a 404 on a bundled asset, a failed subresource.
            // Exactly the class of thing a wrong path in a packaged build
            // produces, so it has to fail the smoke as loudly as a throw.
            if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
                this.errors.push(`[${msg.params.entry.source}] ${msg.params.entry.text}`);
            }
        });
    }

    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', () => reject(new Error(`CDP connect failed: ${url}`)), { once: true });
        });
        return new CdpSession(ws);
    }

    send(method, params = {}) {
        const id = this.#nextId++;
        this.#ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
            setTimeout(() => {
                if (this.#pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
            }, 15_000);
        });
    }

    /** Evaluates in the page and returns the (JSON-serialisable) value. */
    async evaluate(expression) {
        // `async` unconditionally, paired with `awaitPromise`, so a check
        // can `await` inside its expression without every caller having to
        // declare whether it does.
        const result = await this.send('Runtime.evaluate', {
            expression: `(async () => { ${expression} })()`,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        }
        return result.result.value;
    }

    close() {
        try {
            this.#ws.close();
        } catch {
            // Already closed.
        }
    }
}

/** GETs a JSON endpoint, resolving `null` on any failure (the port may not be up yet). */
export async function fetchJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

