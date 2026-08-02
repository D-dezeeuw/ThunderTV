# desktop/

The Electron shell — deliberately dumb (masterplan Phase 28): one main
process, one preload bridge, no business logic. The actual app is the same
built `dist/` the web deploy ships; see `src/core/platform/README.md` for
the platform-adapter architecture decision (why this embeds a local proxy
instead of a full IPC HTTP adapter).

## Running from source

```bash
npm install          # repo root
cd desktop && npm install
npm start             # builds the web app, swaps to vendored Spektrum, launches
```

## Default first-run config for local dev

Copy `.env.example` to `.env` in this directory and fill in any of: an
Xtream panel URL/username/password, a UI locale, and/or a Live-filter
country. `main.mjs` reads it at startup; `bootstrap.ts` applies whichever
fields are set as pre-filled first-run-wizard answers, but only while the
wizard would otherwise open (a fresh install, or after clearing local
storage) — never as a standing override once setup is complete or a source
exists. An Xtream default skips the wizard outright; locale/region alone
still opens it, pre-filled. See
`src/core/platform/electron-bridge.types.ts`'s `getDefaultConfig` comment.
`.env` is gitignored and outside `electron-builder.yml`'s files allowlist,
so this never affects a packaged build, only `npm start` from your own
checkout.

## Audio transcoding (`transcode.mjs`)

Chromium ships no AC-3, E-AC-3 or DTS decoder, and a large share of movie
files carry exactly those — the browser plays the picture, drops the audio
track, and reports no error at all. On the web the only honest answer is a
message. Here there is a better one: `transcode.mjs` embeds a second
loopback server that streams the same film back with `-c:v copy -c:a aac`,
so the video is passed through untouched and only the audio goes through an
encoder.

- **Fragmented MP4 on stdout**, not HLS: no temp files, no segment
  bookkeeping, one ffmpeg process per session. The renderer feeds it into
  MediaSource (`src/player/transcode-engine.ts`), which is what keeps the
  duration and the scrub bar real.
- **Seeking is a new request.** `/stream?t=…` kills the running process and
  starts another with `-ss`, so jumping into hour two costs a keyframe scan
  rather than a download of everything before it. One process at a time,
  killed on supersede, on client abort, and on `will-quit`.
- **Token-gated**, unlike the proxy next door: this one hands an arbitrary
  URL to a subprocess, so `preload.cjs` passes a per-session token along with
  the origin (`window.electron.transcode`) and an untokened request gets 403.
- **`/status`** reports `{ ok, ffmpeg }` — the smoke test asserts both, since
  a build that shipped without the binary is a desktop app with a web app's
  limits.
- **VOD only.** Live has no duration to seek in and is routinely MPEG-2
  video, which `-c:v copy` cannot put into an MP4 that anything plays.

ffmpeg comes from `ffmpeg-static`, a **devDependency** of this package on
purpose: production dependencies are copied into `app.asar` automatically,
and this one is placed by hand under `extraResources` — a binary inside an
asar has no filesystem path and cannot be executed at all. It costs about
78 MB per platform artifact, which is the price of a media pipeline; nothing
smaller decodes AC-3, E-AC-3, DTS and TrueHD. `resolveFfmpegPath()` looks in
the packaged location first (`resources/ffmpeg/`) and then in
`desktop/node_modules/`, the same candidate-list pattern `main.mjs` uses for
the icon and `index.html`.

## Testing this shell (and why the usual gates miss it)

`npm run verify` never launches Electron, and `tsconfig.json` doesn't
include `desktop/`, so for a long time the only thing standing behind these
four files was ESLint's untyped pass. Two bugs shipped through that gap at
once — both invisible from a checkout, both fatal in a packaged build:

| Bug | Why `npm start` couldn't see it |
| --- | --- |
| `main.mjs` imports `../scripts/proxy-server.mjs`, which nothing packaged | `desktop/` and `scripts/` are siblings in the repo; inside `app.asar` that path leaves the package entirely |
| `main.mjs` loaded `../dist/index.html` | `electron-builder.yml` maps `dist/` *inside* the asar, so packaged it resolved one level too high |

**A broken Electron app does not exit.** Both failures left a live process:
the first parked on Electron's "A JavaScript error occurred in the main
process" dialog, the second held an empty window open. Anything shaped like
`run it for 30s and check the exit code` passes on a completely dead app —
which is why the checks below assert positive signals instead.

Three layers, cheapest first:

```bash
npm run lint:desktop-package   # ~50ms, no Electron — in `npm run verify`
npm test -- desktop/           # the main-process specs, no Electron
npm run smoke:desktop          # ~10s, real Electron, headless
npm run smoke:desktop:packaged # the same, against a built artifact
```

`desktop/*.spec.mts` runs in the repo's own Vitest (see `vitest.config.ts`'s
`include`), against a *fake* `spawn` so the transcode server's HTTP contract
is checked on every machine; the one block that needs the real binary skips
itself where `desktop/node_modules` was never installed.

**`scripts/check-desktop-package.mjs`** walks the module graph from
`main.mjs`/`preload.cjs` and resolves every relative import *in packaged
coordinates* (`app.asar/` for `files:`, `resources/` for
`extraResources:`), failing on anything the allowlist doesn't place there.
It is in `npm run verify`, so the first bug above can't come back.

**`scripts/smoke-desktop.mjs`** (with `smoke-desktop-bridge.mjs`, which owns
the `window.electron` contract and the two localhost-server probes) actually
launches the app — starting its own
Xvfb when `DISPLAY` is unset — and drives the live renderer over the Chrome
DevTools Protocol on Node's built-in `WebSocket` (no Playwright, no new
dependency). It asserts the main process survived its own module graph, a
window loaded the built `index.html`, `#app` is populated, Spektrum bound
the template, `window.electron` matches `ElectronBridge` member for member,
and both embedded servers answer on the origins the bridge advertises — the
proxy, and the transcoder (`/status` with `ffmpeg: true`, plus a 403 for an
untokened `/stream`). It
writes a PNG to `release/smoke/` either way, and `--json` prints a
machine-readable report.

Findings the harness can see but that reproduce against the plain web build
are reported as non-fatal notes rather than failures — a desktop smoke that
goes red for an app-wide bug no change to `desktop/` could fix stops being
worth running. There are none today: the two that existed were both the
Spektrum expression-cache overflow, fixed by
`public/vendor/spektrum.runtime.js` (see that directory's README).

The technique behind all of this — Xvfb, CDP over Node's built-in
`WebSocket`, and the packaged-vs-source path table that explains both bugs
above — is written up as an agent skill in
`.claude/skills/electron-testing/`. Read that before changing
`electron-builder.yml`'s allowlists or any `__dirname`-relative path in
`main.mjs`.

## Packaging

```bash
cd desktop
npm run package          # all locally-buildable targets
npm run package:linux    # AppImage
npm run package:win      # nsis + portable
npm run package:mac      # dmg
```

Config: `../electron-builder.yml` (repo root, see that file's header for why).
Output: `../release/` (gitignored).

**Verified in this sandbox:** Linux AppImage builds and launches its
`app.asar` layout correctly (`main.mjs`/`preload.cjs`/`splash.html`/
`dist/**` present, source/tests/scripts excluded). **Not verified:**
Windows/macOS artifacts — no cross-compile toolchain here; `.github/
workflows/desktop-build.yml` builds all three on a `v*` tag push.

## Security posture (masterplan Feature 28.8 checklist)

| Item | Status |
| --- | --- |
| `contextIsolation: true` | done, explicit in `main.mjs` |
| `nodeIntegration: false` | done, explicit |
| `sandbox: true` | done, explicit |
| `webviewTag: false` | done, explicit |
| Popup denial (`setWindowOpenHandler`) | done — denies all, routes `http(s):` to `shell.openExternal` |
| Navigation lock (`will-navigate`) | done — same-origin only, else cancelled (+ `shell.openExternal` for `http(s):`) |
| Permission handler | done — denies every request except `fullscreen` (see below); no notifications/geolocation/media in this app |
| Single-instance lock | done — second launch focuses the existing window |
| Remote code | none — vendored Spektrum only, no CDN script in the packaged build |
| DevTools gating | not yet wired to a dev-only flag — `main.mjs` never opens devtools itself either way; revisit if a dev workflow script is added |
| Code signing | deliberately unsigned for v1 — see `electron-builder.yml`'s commented signing stubs and the top-level task's rationale (no cert budget for a local-build personal project) |

### Why `fullscreen` is allowed

Electron routes `Element.requestFullscreen()` through
`setPermissionRequestHandler`, so the original blanket `callback(false)`
didn't just harden the shell — it made the player's fullscreen button dead
on the desktop build while it kept working on the web. It is one named
allowance, for a capability this app's own UI asks for on purpose, from a
renderer that can only ever load this app's own `file://` page; everything
else still defaults to deny. No `setPermissionCheckHandler` alongside it,
deliberately: nothing set one before the request handler existed, so a
deny-all check handler would be a *new* denial surface rather than a fix.

`main.mjs` also exposes a window-fullscreen toggle over IPC
(`thundertv:set-window-fullscreen`, mirrored back on
`thundertv:window-fullscreen` so the preload can answer synchronously). The
renderer uses it as a fallback when page-level fullscreen doesn't take —
see `src/player/README.md`'s Fullscreen section.

## The window icon

`BrowserWindow.icon` is a *runtime* icon, entirely separate from
`electron-builder.yml`'s `win`/`mac`/`linux` `icon:` entries (which brand
the installer, the `.exe` and the `.desktop` file). It has to be readable
from inside the running app, so `electron-builder.yml` maps `build/icons/`
into the package as `icons/` and `main.mjs`'s `ICON_CANDIDATES` tries that
first, then the repo-relative `../build/icons/` path an unpackaged
`npm start` sees. With nothing mapped in, packaged builds found no icon at
all and fell back to Electron's default — that was the "we see the Electron
icon" bug. macOS ignores `BrowserWindow.icon` outright, so the dock icon is
set through `app.dock.setIcon()` (which only matters unpackaged; a packaged
`.app` carries `build/icon.icns`).

## Deliberately out of scope for this pass

- Full main-process `net.request` IPC HTTP adapter (masterplan Feature
  28.4) — the embedded-proxy approach covers the same capability
  (`corsUnrestricted: true`) with a much smaller diff; see
  `src/core/platform/electron-platform.ts`.
- Native file dialogs (Feature 28.5), window-state persistence (Feature
  28.7), auto-update (Feature 29.6), diagnostics export (Feature 29.7),
  code signing/notarization (Feature 29.5) — all real masterplan scope, not
  implemented here; this pass covers the platform adapter, security
  hardening, splash screen, packaging pipeline, and CI.
