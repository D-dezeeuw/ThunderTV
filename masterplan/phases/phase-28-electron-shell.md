# Phase 28 — Electron Shell

> **Epic goal:** The exact same `dist/` becomes a desktop app: a minimal main process, a typed preload bridge, and CORS-free main-process HTTP behind the existing `PlatformAdapter` — with zero UI changes.
> **Verification:** `npm run electron:preview` (build + import-map swap + launch) shows the working app under `file://`; a URL import that fails on the web succeeds in Electron; `contextIsolation` is on, `nodeIntegration` is off, and the Playwright `_electron` smoke passes including the full-IDB storage-tier check.

Before this phase ThunderTV is a web app with an `ElectronPlatformAdapter`-shaped hole reserved by the Phase 03 adapter layer (`window.electron` detection, `capabilities.corsUnrestricted`). After this phase an `electron/` folder holds a deliberately dumb main process and a typed `contextBridge` preload; the renderer is the unchanged built `dist/` loaded via `file://` with the vendored-Spektrum import map; HTTP runs CORS-free in the main process; native file dialogs replace `<input type=file>`; and the whole thing is covered by a Playwright `_electron` smoke. Packaging and installers are Phase 29's job — this phase ends at "runs correctly from a local build".

## Feature 28.1 — Minimal main process

One `BrowserWindow`, one `loadFile`, standard lifecycle — `electron/main.ts` stays deliberately dumb so the app remains a web app that happens to have a desktop shell.

- [ ] **28.1.1** Scaffold `electron/` — `main.ts` plus its own tsconfig and an esbuild compile step to `electron/dist/`, with every file under the 300-line rule.
- [ ] **28.1.2** Single `BrowserWindow` — dark `backgroundColor` matching `tokens.css` to avoid a white flash, sane minimum size, shown only on `ready-to-show`.
- [ ] **28.1.3** Load the built app — `win.loadFile('dist/index.html')` resolved from `app.getAppPath()` so the path works both unpacked and packaged later.
- [ ] **28.1.4** Minimal menu — replace the default menu with a tiny one (quit; reload and devtools entries in dev only).
- [ ] **28.1.5** Standard lifecycle — quit on `window-all-closed` (macOS `activate` re-creates the window per platform convention).
- [ ] **28.1.6** Single-instance lock — `app.requestSingleInstanceLock()`; a second launch focuses the existing window instead of spawning.
- [ ] **28.1.7** Main-process error log — uncaught exceptions appended to a file under `userData/logs` through the shared redaction rules; never a modal dialog.
- [ ] **28.1.8** npm scripts — `npm run electron:build` (compile main + preload) and `npm run electron:start` (launch against the built, swapped `dist/`).
- [ ] **28.1.9** Keep main dumb — a written rule in `electron/README.md`: no business logic in main, only window management, IPC registration, and app events.
- [ ] **28.1.10** First manual run — build the web dist, run the import-map swap, launch, and confirm the channel list renders; result noted in this phase file.

## Feature 28.2 — Typed preload bridge

`contextBridge` exposes a minimal `window.electron` API whose shape lives in one shared TypeScript type — preload, main, and renderer all compile against the same contract, so IPC drift is a type error.

- [ ] **28.2.1** Shared contract — an `ElectronBridge` interface in `src/core/platform/electron-bridge.types.ts`, imported by preload, main, and the renderer adapter alike.
- [ ] **28.2.2** `electron/preload.ts` — `contextBridge.exposeInMainWorld('electron', api)` with `ipcRenderer.invoke`-style wrappers only; raw `ipcRenderer` is never exposed.
- [ ] **28.2.3** Channel constants — one shared module of IPC channel-name constants imported by both preload and main so channel strings cannot drift apart.
- [ ] **28.2.4** Typed handlers — every `ipcMain.handle` is typed against the same request/response types; `electron/` joins the `tsc --noEmit` run in `verify.mjs`.
- [ ] **28.2.5** Minimal-surface rule — the bridge exposes only what `PlatformAdapter` needs (HTTP request, file dialogs, window utilities, app version); anything broader is a review reject.
- [ ] **28.2.6** No node leakage — a spec asserts `window.require` and `window.process` are `undefined` in the renderer under the bridge.
- [ ] **28.2.7** Versioned handshake — the bridge exposes a `bridgeVersion`; the renderer logs a redacted warning on mismatch to catch stale packaged preloads.
- [ ] **28.2.8** Serialization discipline — only structured-cloneable plain data crosses the bridge; streaming uses the explicit chunked pattern from Feature 28.4, never transferred objects with behavior.
- [ ] **28.2.9** Preload unit test — run the preload module with stubbed `contextBridge`/`ipcRenderer` and assert the exposed API shape matches the shared type.
- [ ] **28.2.10** Extension recipe — `electron/README.md` documents that adding a bridge method means: type + channel constant + preload wrapper + main handler + adapter usage.

## Feature 28.3 — ElectronPlatformAdapter

The Phase 03 insurance policy pays out: one new `PlatformAdapter` implementation over the bridge, selected by `window.electron` detection at bootstrap, and not a single UI file changes.

- [ ] **28.3.1** Create `src/core/platform/electron/` — `ElectronPlatformAdapter` implementing `PlatformAdapter` entirely over `window.electron`; no other module may touch the bridge.
- [ ] **28.3.2** Detection — the bootstrap keeps the thunder-tv pattern: `window.electron` truthy → Electron adapter, else `WebPlatform`; one selection point in `src/main.ts`.
- [ ] **28.3.3** Capability flags — `corsUnrestricted: true`, `externalPlayers: false` for v1, and `durableStorage` still coming from the same boot probe.
- [ ] **28.3.4** HTTP delegation — the adapter's `HttpAdapter` calls the main-process HTTP (Feature 28.4) while preserving the `classifiedFetch` result contract so no caller branches on platform.
- [ ] **28.3.5** Files delegation — `FileAdapter` maps to native dialogs (Feature 28.5) returning the same shape (name + content) as the web `<input type=file>` path.
- [ ] **28.3.6** Storage unchanged — Electron keeps the tiered browser storage (IDB expected `full`); record the decision note that SQLite stays out because Phase 26 profiling did not demand it, per plan §M6.
- [ ] **28.3.7** Capability-driven UI — with `corsUnrestricted` true, the proxy setting and CORS warning surfaces hide via their existing `data-if` capability bindings — no platform sniffing in views.
- [ ] **28.3.8** Mixed-content spec — assert `mixedContentBlocked()` is naturally false under `file://` (no `https:` page origin), so `http://` streams play without a warning.
- [ ] **28.3.9** Adapter unit tests — specs with a stubbed `window.electron` verify delegation and capability flags; the existing `WebPlatform` specs stay green untouched.
- [ ] **28.3.10** Lint fence extension — ESLint config restricting `window.electron` references to `src/core/platform/electron/`, extending the existing no-direct-platform-API fences.

## Feature 28.4 — Main-process HTTP

Requests executed in the main process have no CORS: an `ipcMain.handle` endpoint built on Electron's `net`/session fetch gives the renderer proxy-free playlist, EPG, and Xtream access, streamed in chunks — and flips the CORS UX off for good.

- [ ] **28.4.1** Implement `electron/http.ts` — an `ipcMain.handle('http:request')` handler executing requests with Electron's `net.request` (or the session-based `fetch`) in the main process.
- [ ] **28.4.2** Typed contract — `{ url, method, headers, timeoutMs }` in, `{ status, headers-subset, body }` out, declared in the shared bridge types.
- [ ] **28.4.3** Chunked body streaming — large responses stream to the renderer as chunk messages keyed by request id, so a 100 MB playlist never crosses IPC as one message (mirroring the §5.10 worker rule).
- [ ] **28.4.4** Timeout and cancel — a 15 s default matching `classifiedFetch`, plus a cancel channel by request id that destroys the in-flight `net` request.
- [ ] **28.4.5** Conditional-GET passthrough — `If-None-Match`/`If-Modified-Since` travel through and a `304` short-circuits back so the §6.6 refresh flow works identically.
- [ ] **28.4.6** Error taxonomy mapping — DNS, connection-refused, and timeout failures map onto the existing `FetchFailure` kinds; `cors-or-network` is never reported when `corsUnrestricted` is true.
- [ ] **28.4.7** Segment traffic strategy — hls.js/mpegts.js fetches stay in the renderer; inject permissive CORS headers for stream hosts via `session.webRequest.onHeadersReceived` so playback is CORS-free while `webSecurity` stays enabled; decision and rationale noted.
- [ ] **28.4.8** Guardrails — main validates an `http:`/`https:`-only scheme allowlist (LAN hosts allowed — IPTV servers live there) and enforces a configurable maximum response size.
- [ ] **28.4.9** Redaction — every main-process log line about a request passes the shared credential redactor first, since Xtream URLs embed user/pass as path segments (§6.8).
- [ ] **28.4.10** Handler tests — unit tests against the Phase 27 Xtream mock cover 200, 304, timeout, and cancel paths.

## Feature 28.5 — Native file dialogs

`dialog.showOpenDialog` through the bridge replaces the file input for M3U and XMLTV imports — same `FileAdapter` contract, so the import flows don't know the dialog went native.

- [ ] **28.5.1** IPC handler — `files:open` invokes `dialog.showOpenDialog` on the app window with filters per request kind (`.m3u`/`.m3u8` vs `.xml`/`.xml.gz`).
- [ ] **28.5.2** Read in main — the selected file is read with `node:fs/promises` in the main process and returned as text, so the renderer never handles filesystem paths.
- [ ] **28.5.3** Bridge and adapter wiring — `files.openPlaylist()` / `files.openEpg()` on the bridge, mapped by `ElectronPlatformAdapter` onto the existing `FileAdapter` interface unchanged.
- [ ] **28.5.4** Cancel semantics — dialog cancel resolves to a typed null result, not an error; the import UI treats it as a no-op.
- [ ] **28.5.5** Large-file path — files past a size threshold stream to the renderer in chunks feeding the parser worker incrementally, keeping the < 5 s / 100 k budget reachable.
- [ ] **28.5.6** Filename retention — source metadata stores only the base name (never the full path) for `m3u-file` source display, keeping user paths out of exports.
- [ ] **28.5.7** Gzip parity — a natively-selected `.gz` XMLTV goes through the same worker decompression path as on web; no divergent code branch.
- [ ] **28.5.8** Scope to single-file — no `multiSelections` in v1; the decision and its revisit condition noted in this phase file.
- [ ] **28.5.9** Contract regression spec — a shared `FileAdapter` contract test asserts the web `<input type=file>` path and the Electron dialog path return identical shapes.
- [ ] **28.5.10** Manual dialog QA — verify filters, cancel, and non-ASCII filenames on the dev OS; note per-OS differences for the Phase 29 QA checklist.

## Feature 28.6 — file:// loading correctness

`base: './'` was chosen in Phase 01 exactly for this moment: the built `dist/` must load from `file://` with the import map swapped to the vendored Spektrum, hash routing intact, and workers resolving.

- [ ] **28.6.1** Relative-asset audit — a script scans `dist/index.html` and chunks for any absolute `/assets` references and fails if `base: './'` was bypassed anywhere.
- [ ] **28.6.2** Import-map swap in the launch chain — `scripts/package-target.mjs` runs before every Electron start/pack, rewriting the built HTML's `"spektrum"` entry to `./vendor/spektrum.min.js` (§6.10); `dist/` is never hand-edited.
- [ ] **28.6.3** Swap self-verification — the script re-reads the written HTML and fails if a CDN origin is still present; the rewrite regex gets a unit spec.
- [ ] **28.6.4** Vendored-file presence — the swap asserts `dist/vendor/spektrum.min.js` exists and matches the pinned version hash before reporting success.
- [ ] **28.6.5** Hash routing under `file://` — verify `#/` routes and `#/connect` parsing behave identically to the web; document any `location` quirks found.
- [ ] **28.6.6** Credential scrub under `file://` — a regression spec proves the `history.replaceState` scrub works with `file://` URLs (using `location.href` minus hash if `pathname` misbehaves).
- [ ] **28.6.7** Worker resolution — confirm the Vite-emitted M3U and EPG worker chunks load under `file://` (relative worker URLs), a classic packaging failure mode; the smoke runs a real parse.
- [ ] **28.6.8** Service worker skipped — the Phase 24 SW registration is bypassed under Electron/`file://`, avoiding pointless registration errors; behavior noted next to the SW kill-switch.
- [ ] **28.6.9** Packaged CSP — `package-target.mjs` injects a meta CSP suited to `file://` (self scripts only, http/https connect and media for streams and logos); verify the app is fully functional under it.
- [ ] **28.6.10** Full manual pass — import by file, URL, and Xtream, load EPG, play, and reload-restore under `file://`; results recorded in this phase file.

## Feature 28.7 — Window state persistence

The desktop nicety users actually notice: bounds and maximized state remembered across launches in a small `userData` JSON file, owned entirely by the main process.

- [ ] **28.7.1** `electron/window-state.ts` — read/write `userData/window-state.json` holding bounds, `isMaximized`, and the display id.
- [ ] **28.7.2** Restore on create — apply saved bounds to the `BrowserWindow` options before show; defaults on first run or unreadable file.
- [ ] **28.7.3** Off-screen guard — validate saved bounds intersect a current display via `screen.getAllDisplays()` and re-center otherwise (the unplugged-monitor case).
- [ ] **28.7.4** Debounced writes — resize/move events debounce ~500 ms, with a final flush on window close.
- [ ] **28.7.5** Maximized handling — store `isMaximized` separately and re-maximize after creating with normal bounds, so unmaximize returns to a sane size.
- [ ] **28.7.6** Corrupt-file resilience — a JSON parse failure renames the bad file aside and starts from defaults; never crashes the launch.
- [ ] **28.7.7** Boundary note — window state lives in main only, deliberately outside the renderer's tiered storage; the boundary documented in `electron/README.md`.
- [ ] **28.7.8** Versioned schema — a `version` field in the JSON so future fields (e.g. fullscreen) can migrate cleanly.
- [ ] **28.7.9** Unit tests — the bounds-validation and debounce logic extracted as pure functions and spec'd, including the off-screen re-center cases.
- [ ] **28.7.10** Manual verification — move/resize/maximize/quit/relaunch on the dev OS; per-OS quirks noted for the Phase 29 checklist.

## Feature 28.8 — Security defaults

Non-negotiables, set explicitly and tested: `contextIsolation` on, `nodeIntegration` off, popups denied, navigation locked to the app, and external links routed through `shell.openExternal` behind a scheme allowlist.

- [ ] **28.8.1** Explicit `webPreferences` — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webviewTag: false` written out in `main.ts`; never rely on version defaults.
- [ ] **28.8.2** Navigation lock — `will-navigate` (and frame variants) cancel any navigation away from the app's `file://` entry; hash changes remain unaffected.
- [ ] **28.8.3** Popup policy — `setWindowOpenHandler` denies all window opens; qualifying external links are handed to `shell.openExternal` instead.
- [ ] **28.8.4** `openExternal` hygiene — only `http:`/`https:` URLs pass the allowlist; anything else is dropped and logged redacted.
- [ ] **28.8.5** Zero remote code — the packaged shell loads no remote scripts (vendored Spektrum, no CDN); enforced by scanning the swapped `index.html` for external script origins.
- [ ] **28.8.6** Permission handler — `session.setPermissionRequestHandler` denies everything the app does not need (notifications, geolocation, media devices); the empty allowlist documented.
- [ ] **28.8.7** DevTools gating — `devTools: false` in production launches; enabled only through the dev workflow flag.
- [ ] **28.8.8** Bridge audit — a checklist pass over the preload surface confirming no channel allows arbitrary filesystem, network, or process access by parameter (file reads only via the dialog flow).
- [ ] **28.8.9** Electron security checklist — walk the official Electron security checklist item by item and record each status in `electron/README.md`.
- [ ] **28.8.10** Security regression specs — a Playwright `_electron` spec asserts `window.require` is undefined, a popup attempt is blocked, and an external navigation attempt is cancelled.

## Feature 28.9 — Electron dev workflow

The edit-reload loop must stay as fast as the web's: Vite dev server plus Electron running concurrently, HMR in the renderer, auto-restart for main, and source maps working on both sides.

- [ ] **28.9.1** Dev script — `npm run electron:dev` runs the Vite dev server and Electron concurrently via a small `scripts/` launcher that waits for the dev URL to respond before launching Electron.
- [ ] **28.9.2** Dev-mode load — `main.ts` loads `http://localhost:5173` when a dev env flag is set, `file://` otherwise; this branch is the only dev/prod difference in main.
- [ ] **28.9.3** Import map in dev — dev mode keeps the CDN import map (network exists); add `npm run electron:preview` (build + swap + launch) as the only truthful way to test packaged-style loading.
- [ ] **28.9.4** Source maps — Vite maps work in the renderer devtools; main and preload compile with `sourcemap: true` and main-process debugging via `--inspect` is documented.
- [ ] **28.9.5** Auto-restart — an esbuild watch on `electron/` recompiles and relaunches Electron on main/preload changes; renderer HMR comes free from Vite.
- [ ] **28.9.6** DevTools opt-in — auto-open devtools only behind an explicit env flag, mirroring thunder-tv's opt-in convention rather than always-open.
- [ ] **28.9.7** Adapter parity in dev — dev-mode Electron exposes `window.electron` so the Electron adapter is what's exercised; the plain browser dev server keeps `WebPlatform` — same detection, no special cases.
- [ ] **28.9.8** Gate integration — `electron/` joins the `verify.mjs` typecheck and ESLint runs, with max-lines and the platform-API fences applying there too.
- [ ] **28.9.9** Troubleshooting doc — `electron/README.md` lists the common failures (stale `electron/dist`, port in use, swap not run) with fixes.
- [ ] **28.9.10** Clean-checkout smoke — verify the loop on a fresh clone: install → `electron:dev` → edit a view → HMR reflects; wall-clock noted in this phase file.

## Feature 28.10 — Electron smoke tests

Playwright's `_electron` driver proves the whole story end to end: launch, bridge present, CORS-free import, playback, and the full-IDB storage tier — the desktop counterpart of the Phase 27 web smoke.

- [ ] **28.10.1** `_electron` setup — an Electron spec file launching via `_electron.launch` with the compiled main and a temp `userData` dir per run.
- [ ] **28.10.2** Pre-test chain — the E2E script builds the web dist, runs `scripts/package-target.mjs`, and compiles `electron/` before launching.
- [ ] **28.10.3** Launch assertion — the first window appears with the right title and no renderer console errors above warning level.
- [ ] **28.10.4** Bridge and capability check — `window.electron` is truthy and the adapter reports `corsUnrestricted: true`.
- [ ] **28.10.5** Storage-tier check — the probed tier is `full` (real IndexedDB in Electron) and data persists across an in-test relaunch reusing the same temp `userData`.
- [ ] **28.10.6** Import fixture — the paste-text import flow ingests a fixture playlist end to end; the native-dialog handler is covered separately by a main-process unit test with `dialog` mocked.
- [ ] **28.10.7** CORS-free proof — import an M3U by URL from the Phase 27 mock running with CORS headers disabled; it must succeed here though it fails on web — the definitive capability test.
- [ ] **28.10.8** Play stub — play the mock's stub stream and assert the video element advances (`readyState`/`currentTime`).
- [ ] **28.10.9** Session restore — quit and relaunch with the same `userData`; the last channel and favorites render from the state cache before any re-parse.
- [ ] **28.10.10** Gate wiring — `npm run test:e2e:electron` documented and included in `verify.mjs --e2e` for Electron-affecting changes.
