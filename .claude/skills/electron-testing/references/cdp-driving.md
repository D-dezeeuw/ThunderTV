# Driving an Electron renderer over CDP

A dependency-free way to launch a real Electron app on a machine with no
screen and make assertions about what is actually on that screen. Node 22+
only (for the global `WebSocket`).

`scripts/cdp-client.mjs` in this repo is the maintained implementation of
everything here and is deliberately app-agnostic — prefer copying that over
retyping this. The code below is the portable version for other projects,
and the commentary explains the parts that are non-obvious.

## Contents

- [Sequence](#sequence)
- [Getting a display](#getting-a-display)
- [Finding the debugger port](#finding-the-debugger-port)
- [The client](#the-client)
- [Picking the right target](#picking-the-right-target)
- [Evaluating in the page](#evaluating-in-the-page)
- [Collecting errors](#collecting-errors)
- [Screenshots](#screenshots)
- [Traps](#traps)

## Sequence

```
start Xvfb (if no DISPLAY)
  └─ spawn app with --remote-debugging-port=0 --user-data-dir=<tmp>
       └─ poll <tmp>/DevToolsActivePort   ← also the "did it boot" signal
            └─ GET /json/list             ← find the page target by URL
                 └─ WebSocket to its webSocketDebuggerUrl
                      ├─ Runtime.enable, Page.enable, Log.enable
                      ├─ Runtime.evaluate  ← the assertions
                      └─ Page.captureScreenshot
```

## Getting a display

```js
import { spawn } from 'node:child_process';

export function startDisplay(log = () => {}) {
    if (process.env.DISPLAY) return { display: process.env.DISPLAY, stop: () => {} };

    const display = `:${String(90 + Math.floor(Math.random() * 9))}`;
    const proc = spawn('Xvfb', [display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
        stdio: 'ignore',
        detached: true,
    });
    proc.unref();
    return {
        display,
        stop: () => { try { process.kill(proc.pid, 'SIGKILL'); } catch { /* gone */ } },
    };
}
```

`-nolisten tcp` because nothing should be able to reach this X server but
the harness. The random display number avoids collisions with a parallel
run; if that matters, probe `/tmp/.X<n>-lock` instead of guessing.

## Finding the debugger port

Launch with `--remote-debugging-port=0` and let Electron pick. It writes the
bound port as the first line of `<user-data-dir>/DevToolsActivePort`.

```js
function readDevToolsPort(userDataDir) {
    try {
        const [port] = fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n');
        const parsed = Number(port);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch { return null; }
}
```

Polling for this file doubles as the first health check: if the main process
threw during module evaluation, the file never appears. Bound the wait, and
abort early if stderr already showed a fatal or the process exited — the
whole point is that neither of those is guaranteed to happen.

## The client

```js
export class CdpSession {
    #ws; #nextId = 1; #pending = new Map();
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
}
```

The per-message timeout is load-bearing: several CDP mistakes manifest as a
reply that simply never arrives, and without it the harness hangs instead of
failing.

## Picking the right target

```js
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const target = list.find(
    (t) => t.type === 'page' && /index\.html$/.test(String(t.url).split('#')[0]),
);
```

Match on the URL, not on "the first page". Splash screens, hidden windows,
and devtools are all targets. Strip the hash before matching or a
hash-routed app fails the pattern. Requiring the *real* document is what
turns "the splash came up but the app never loaded" into a failure.

## Evaluating in the page

```js
// a method on CdpSession, alongside send()
async evaluate(expression) {
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
```

Wrap in an **async** IIFE unconditionally and pair it with `awaitPromise`,
so individual checks can `await` without every call site declaring whether
it does. `returnByValue` gives plain JSON back instead of remote object
handles — keep evaluated expressions returning serialisable data.

The response nests twice (`result.result.value`). Reading one level is a
common slip and yields a silent `undefined` that looks like the app
returning nothing.

## Collecting errors

Three separate channels, and they do not overlap:

| Domain event | Catches |
| --- | --- |
| `Runtime.consoleAPICalled` | explicit `console.error(...)` from app code |
| `Runtime.exceptionThrown` | uncaught exceptions and rejections |
| `Log.entryAdded` (`level: 'error'`) | CSP blocks, failed subresource loads, network errors |

`Log.enable` is the one that matters for packaging bugs — a 404 on a bundled
asset never reaches `console`. Classify what you collect: a failed
*resource load* is a packaging failure and should be fatal; an app-level
`TypeError` from the shared web bundle usually is not the shell's fault.

Because you attach after boot, errors logged during startup are lost. That
is the accepted cost of not reloading (see Traps). If boot-time logs are
genuinely required, attach at the browser endpoint with
`Target.setAutoAttach` + `waitForDebuggerOnStart` instead of reloading.

## Screenshots

```js
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
```

Capture on success too. A structurally correct app whose every label is
empty passes most DOM assertions and is obviously broken in a screenshot.

## Traps

**`Page.reload()` after attaching.** Destroys the execution context the
session evaluates in; every later `Runtime.evaluate` hangs until timeout
with no error message. The natural instinct — reload so you can capture the
full boot log — costs the entire run. Don't.

**Assuming a non-zero exit means failure and zero means success.** Neither
holds. A fatal main-process error keeps the process alive; `timeout` then
reports 124, which is indistinguishable from a healthy app that was killed
on schedule.

**A reused user-data dir.** Persisted app state silently changes what the
next run tests.

**Unfiltered Chromium noise.** D-Bus, GPU/viz, swiftshader and EGL errors
are unavoidable in a container and will bury the one line that matters.
Filter them out of reported output, but keep the raw log for a failure dump.

**Probing your own harness into the error list.** If a check deliberately
provokes an HTTP error to prove a server is listening, snapshot the error
list *before* running it, or the harness fails itself.

**Asserting DOM absence for something the framework only hides.** Most
conditional-rendering directives toggle `style.display` rather than
unmounting, so `!document.querySelector(sel)` is a check that can never
pass. Assert `getComputedStyle(el).display === 'none'` — or whatever the
framework actually does — and you are testing what a viewer sees rather
than an implementation detail you guessed at. An assertion that fails on
every single run, including ones whose screenshot looks perfect, is almost
always this.

**Collecting only `console.error`.** `Runtime.consoleAPICalled` carries a
`type`, and a framework that reports broken bindings via `console.warn`
will be invisible to a harness filtering for errors. When a run looks clean
but the screenshot doesn't, widen to `warning` before suspecting the app.
