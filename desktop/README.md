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
| Permission handler | done — denies every request (no notifications/geolocation/media in this app) |
| Single-instance lock | done — second launch focuses the existing window |
| Remote code | none — vendored Spektrum only, no CDN script in the packaged build |
| DevTools gating | not yet wired to a dev-only flag — `main.mjs` never opens devtools itself either way; revisit if a dev workflow script is added |
| Code signing | deliberately unsigned for v1 — see `electron-builder.yml`'s commented signing stubs and the top-level task's rationale (no cert budget for a local-build personal project) |

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
