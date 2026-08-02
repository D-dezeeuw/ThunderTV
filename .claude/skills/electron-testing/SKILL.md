---
name: electron-testing
description: Test Electron desktop apps headlessly — launch them under Xvfb, drive the live renderer over the Chrome DevTools Protocol, and catch packaged-only breakage that a dev-mode launch cannot reproduce. Use this whenever the desktop/Electron build is broken, won't start, shows a blank or wrong window, or "works with npm start but not when packaged"; whenever asked to smoke-test, verify, screenshot, or add test coverage for an Electron app; and whenever touching main-process code, a preload bridge, electron-builder config, an asar/files/extraResources allowlist, or anything under a desktop/ directory. Reach for it even when the request just says "the desktop app is broken" or "check the app actually runs" without naming Electron — and before writing any bespoke launch-and-check script, because the exit-code approach that seems obvious does not work here.
---

# Testing Electron apps headlessly

Electron is unusually hostile to the testing habits that work everywhere
else. The three assumptions that fail:

1. **A broken Electron app does not exit.** It parks on a native error
   dialog, or holds an empty window open, forever.
2. **There is no headless mode.** Unlike Chromium, Electron needs a real X
   server even to fail.
3. **Dev mode and the packaged app are different programs.** Same source,
   different filesystem layout, and the layout is where the bugs live.

Everything below follows from those three.

## The rule that matters most

**Never assert on the absence of a crash. Assert on a positive signal read
out of the live renderer.**

This is not a style preference. In ThunderTV, two fatal bugs shipped at
once — a missing module in the asar (`ERR_MODULE_NOT_FOUND` before any
window opened) and a window loading `index.html` from a path that only
exists in dev (`ERR_FILE_NOT_FOUND`). Both printed an error and then **kept
running**. A harness shaped like:

```sh
timeout 30 ./the-app && echo OK    # ← passes on a completely dead app
```

reports success for both. `timeout` returns 124 because the app was alive,
not because it was healthy. The check has to be "a window exists, it loaded
the right document, and the DOM in it is populated" — which means talking
to the renderer.

## Three layers, cheapest first

Run them in this order. Each catches a class the one below is too slow to
iterate on and the one above is too shallow to see.

| Layer | Cost | Catches |
| --- | --- | --- |
| Static module-graph check | ~50ms, no Electron | Imports that escape the package — the single most common packaged-only fatal |
| Headless launch from source | ~10s | Boot failures, preload-bridge drift, renderer exceptions |
| Headless launch of the *packaged* artifact | + packaging time | Everything the other two structurally cannot see |

Put layer 1 in the normal verify/lint gate — it is fast enough that there
is no reason not to. Layers 2 and 3 belong in an explicit script and CI job;
they need a browser binary and a display, so they are not free.

**Do not skip layer 1 by reasoning that layer 3 subsumes it.** It does, but
a 50ms failure that names the offending import beats a 90-second launch that
reports a generic startup crash.

## Launching Electron where there is no screen

```sh
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
DISPLAY=:99 ./your-app \
  --no-sandbox \                # unprivileged containers can't namespace
  --disable-gpu \
  --disable-dev-shm-usage \     # /dev/shm is tiny in Docker
  --user-data-dir="$(mktemp -d)" \
  --remote-debugging-port=0
```

Notes that cost real debugging time to learn:

- **Spawn `Xvfb` directly rather than wrapping in `xvfb-run`** when the
  harness needs to kill the app: `xvfb-run` wraps the process, so you lose
  the child's PID and cleanup gets unreliable. `xvfb-run -a` is fine for a
  one-shot manual check.
- **A fresh `--user-data-dir` per run is not optional.** Electron apps
  persist state (IndexedDB, localStorage, window position). Reusing a
  profile means run N+1 exercises a different app than run N, and a
  first-run wizard appears or doesn't depending on history.
- **`--remote-debugging-port=0`** lets Electron pick a free port and avoids
  racing whatever else wants a fixed one. It writes the port it actually
  bound to `<user-data-dir>/DevToolsActivePort`; read the first line.

## Driving the renderer over CDP

Node 22+ ships a global `WebSocket`, so a usable CDP client is a few dozen
lines with **no Playwright, no puppeteer, no `ws` package**. That matters in
an agent sandbox where every dependency is another install that can fail
behind a proxy — and Playwright's Electron support additionally pins you to
its own bundled Chromium expectations.

Read `references/cdp-driving.md` for the working client and the exact
message flow. The parts people get wrong:

- **Never `Page.reload()` after attaching.** It destroys the execution
  context your session evaluates in, and every subsequent
  `Runtime.evaluate` hangs until its timeout with no error. It is tempting
  — reloading is how you'd capture boot-time console output — but the cost
  is the whole run. Attach post-boot and accept losing the first few log
  lines.
- **Wrap evaluated expressions in `(async () => { … })()` with
  `awaitPromise: true`**, always. Otherwise any check that wants to `await`
  something fails with a bare `SyntaxError: await is only valid in async
  functions` that reads like a bug in the app rather than in the harness.
- **`Log.enable` catches what `Runtime.consoleAPICalled` cannot** — CSP
  blocks, failed subresource loads, 404s on bundled assets. That is exactly
  the signature of a wrong path in a packaged build, so a harness that only
  listens to `console` misses the thing it was built for.
- **Pick the target by URL.** A splash window and the app window are both
  `type: "page"`. Matching the first page target means "the splash came up"
  passes as "the app loaded".

## What to actually assert

Aim for signals that are cheap to check and specific about *which layer*
broke:

- The main process survived module evaluation (no fatal in stderr, process
  still alive).
- A page target exists whose URL is the real entry document.
- `document.readyState === 'complete'`.
- The app root element has children — proof the framework mounted, not just
  that HTML parsed.
- Framework-specific "it actually bound" evidence. For a template engine,
  leftover `{{ mustaches }}` in `document.body.innerText` is a cheap tell
  that the runtime never ran.
- **The preload bridge, member by member, against its TypeScript
  interface.** Preload files are hand-kept in sync with a type they cannot
  import (sandboxed preloads are CommonJS). Nothing else checks that, and
  the failure is silent: the renderer sees no `window.electron` and quietly
  falls back to its web code path.
- Any main-process service the bridge advertises actually answers.

## Separating shell bugs from app bugs

An Electron shell usually wraps a web app that also ships to browsers. When
the smoke test finds a renderer error, the first question is whether it
reproduces against that same build in plain Chromium over `http://`.

This is worth the ten minutes it takes. In ThunderTV a "blank UI" that
looked like a desktop packaging failure reproduced identically on the web
build in plain Chromium — the app registered more precompiled template
expressions than the framework's LRU cache holds, so the earliest were
evicted and fell back to CSP-blocked `eval`. Same bundle, same bug, nothing
to do with Electron.

**Report cross-target findings as non-fatal notes, and shell-specific ones
as failures.** A suite that is red for reasons its owners cannot act on
stops being run.

But **non-fatal is a routing decision, not a verdict**. That note sat in the
output for two rounds while the desktop shell was declared fixed, and the
app was still unusable. Cross-target means *someone else's layer*, not
*acceptable*. Chase every note to a root cause and say plainly which layer
owns it; a note nobody is accountable for is just a warning that will be
scrolled past.

## Assert what a viewer would see, not what the DOM contains

The counterpart to "no absence-of-crash assertions": presence assertions are
just as easy to get wrong, and they fail in the more embarrassing direction.

A "boot overlay is still up" failure in this repo survived three rounds of
investigation — instrumenting the boot sequence, ruling out renderer
backgrounding, confirming the state change landed — before the actual cause
turned out to be the *assertion*. The framework's conditional directive sets
`style.display = 'none'`; it never unmounts. `!document.querySelector(...)`
could therefore never be true, so the check was reporting a permanent
failure about a perfectly healthy app.

Before asserting that something is gone, confirm what the framework does
when it hides things — `display`, `hidden`, `visibility`, an unmount, or an
`aria-hidden` — and assert that. `getComputedStyle(el).display === 'none'`
is a cheap, framework-agnostic proxy for "a viewer cannot see this."

The tell for this class of mistake: an assertion that fails identically on
every run, in every environment, including ones where the app is visibly
fine in a screenshot. That is the harness being wrong, not the app.

## Reading the logs

Chromium in a container emits a wall of noise that says nothing about the
app — D-Bus connection failures, GPU/viz init errors, swiftshader and EGL
complaints, `Failed to shutdown`. Filter it, or the one real line is
unfindable. Conversely, scan stderr for these, because they are fatal and
the process will not exit on them:

```
A JavaScript error occurred in the main process
ERR_MODULE_NOT_FOUND      ERR_FILE_NOT_FOUND
Uncaught Exception        UnhandledPromiseRejection
```

## Leave an artifact

Capture `Page.captureScreenshot` on every run, pass or fail, and write it
somewhere stable. In an environment with no human at a screen it is the only
way to see *what* the failure looked like — and an agent can read a PNG. A
structurally correct app with every label blank looks identical to a healthy
one in assertion output, and instantly wrong in a screenshot.

Emit a machine-readable summary too (a `--json` flag), so the result can be
consumed without scraping console text.

## Packaged vs. source divergence

This is the bug class that justifies the whole exercise. Read
`references/packaged-vs-source.md` before changing anything in an
electron-builder config, a `files`/`extraResources` allowlist, or any path
built with `__dirname`/`import.meta.url` in the main process.

## In this repo

The three layers exist and are wired up:

```sh
npm run lint:desktop-package      # layer 1, also inside `npm run verify`
npm run smoke:desktop             # layer 2
npm run smoke:desktop:packaged    # layer 3
```

- `scripts/check-desktop-package.mjs` — the static fence.
- `scripts/smoke-desktop.mjs` — the assertions.
- `scripts/cdp-client.mjs` — the reusable Xvfb + CDP harness; it is
  deliberately app-agnostic and is the reference implementation for
  `references/cdp-driving.md`.
- `desktop/README.md` — the shell's own testing section.

Screenshots land in `release/smoke/`. All checks pass and no notes are
expected — if one appears, it is new.
