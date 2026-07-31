# ThunderTV

Performing and minimalistic IPTV client without any distractions.

Four constraints drive every decision in this codebase:

1. **Compact and easy to distribute** — a static GitHub Pages web app,
   deployed with a single local command; hosted verification is deliberate
   (manual or release-tag only), not charged on every small push.
2. **Portable** — the same bundle runs unchanged in Electron
   (Windows/macOS/Linux) and stays viable on constrained browsers like LG
   webOS TVs.
3. **Performance first** — heavy caching, restrained/reduced-motion-aware effects, minimal
   live DOM (windowed lists, lazy loading, adaptive updates), and CPU-heavy
   work (playlist/EPG parsing) offloaded to Web Workers so the main thread
   and the UI never stall.
4. **Straightforward onboarding** — M3U files, pasted playlists, remote M3U
   URLs, and Xtream credentials all enter through one first-run surface.
   Credential-bearing connect bookmarks remain roadmap work, not a v1 claim.

The full architecture rationale lives in
[`masterplan/architecture-plan.md`](./masterplan/architecture-plan.md); the
30-phase build-out plan (10 features each, 10 tasks per feature) lives in
[`masterplan/MASTERPLAN.md`](./masterplan/MASTERPLAN.md) and
[`masterplan/phases/`](./masterplan/phases/). Both originated in the sibling
[`thunder-tv`](https://github.com/d-dezeeuw/thunder-tv) repository (where
this project's planning began) and were moved here once this repository
existed, so the roadmap lives with the code it describes.

## Commands

```bash
npm install        # or: npm ci, from the committed lockfile
npm run dev         # dev server (Vite) — defaults to port 5173
npm run build        # tsc --noEmit && vite build -> dist/
npm run preview       # serve the built dist/ locally (defaults to port 4173)
npm run deploy        # build + publish dist/ to the gh-pages branch (no CI)
npm run lint         # eslint . --max-warnings 0
npm run lint:file-access   # node scripts/check-file-access-fence.mjs — no FileReader outside src/core/platform/ (Feature 07.2.10)
npm run format        # prettier --write .
npm run typecheck       # tsc --noEmit
npm run test         # vitest run
npm run bench:m3u       # vitest run --config vitest.bench.config.ts — 100k-channel M3U parse budget (Feature 06.10)
npm run bench:list       # vitest run --config vitest.bench.config.ts — 90k-row virtual-list scroll/setRows budget (Feature 08.9)
npm run gen:m3u-fixture    # node scripts/gen-m3u-fixture.mjs — seeded M3U fixture generator (see --help-style usage in the script header)
```

## Deploy (GitHub Pages, no Actions)

`npm run deploy` runs `vite build` then pushes `dist/` to this repository's
`gh-pages` branch locally via the `gh-pages` package — no
`.github/workflows/` involved at any point.

**Prerequisites:**

- Push rights to this repository.
- Deploy is always run from a clean, merged `main` — never from a feature
  branch.
- GitHub Pages must be pointed at the `gh-pages` branch root once, in this
  repository's Settings → Pages.

**Rollback:** redeploy an older `main` commit —

```bash
git checkout <sha>
npm ci
npm run deploy
git checkout main
```

**Before every deploy:** preview `dist/` from a nested subpath locally (not
just `npm run preview`, which serves from the root) to catch any
root-absolute asset reference before it reaches Pages — see
`scripts/check-dist.mjs`.

### Reaching your provider from the deployed site

GitHub Pages is static-only and `github.io` is HSTS-preloaded, so the deployed
app can never talk to an `http://` IPTV provider directly (mixed content), and
most providers block cross-origin browser requests anyway (CORS). Both are
fixed by setting a proxy template in **Settings → Streaming** — it covers the
API, the playlist, the EPG, the stream URL, channel logos, and (through
manifest rewriting) HLS segments.

**Which proxy you need depends on why yours is failing**, and the two look
nothing alike:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Import/playback fails with no status code — a generic network error | CORS or mixed content | Cloudflare Worker is enough |
| Channel list loads, but streams fail **403/404** | provider blocks the proxy's datacenter IP | proxy must run at home |
| 403 everywhere, from every IP and client | account expired, or connection limit spent | provider-side |

A **CORS failure never carries a status code** — the browser withholds the
response entirely, and the app reports it as a network error. So a real
403/404 means the request arrived and was refused, which is a different
problem with a different fix. Confirm which by running the same request from
home and from any cloud host:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -A 'VLC/3.0.20 LibVLC/3.0.20' \
  'http://PANEL:PORT/player_api.php?username=U&password=P'      # the API
curl -sS -o /dev/null -w '%{http_code}\n' -A 'VLC/3.0.20 LibVLC/3.0.20' \
  'http://PANEL:PORT/live/U/P/STREAM_ID.ts'                     # a stream
```

API fine from both but the stream only 404ing from the cloud host is the
datacenter block, and no amount of proxy tuning fixes it — only egress does.

**Option 1 — Cloudflare Worker (5 minutes, no hardware).** Deploy
`scripts/cloudflare-cors-proxy.mjs` (setup steps in its header comment) and set
`https://<name>.<account>.workers.dev/{url}` as the proxy template. Adds CORS
headers, bridges http→https, sends a VLC User-Agent (many panels 403 anything
else), and rewrites HLS manifests. **Cloudflare's egress is a datacenter IP**,
so if the table above points at a datacenter block this fixes the API and the
logos but not playback — which is itself a useful confirmation.

**Option 2 — the same proxy, at home (residential IP).** Many panels serve
their API to anything but 404 all stream endpoints for cloud IPs as
anti-restream protection. `scripts/home-proxy.mjs` (Node 20+) wraps the worker
script unchanged on a NAS/Pi/always-on PC:

```bash
PORT=8899 ALLOWED_HOSTS=provider.example:8080 node scripts/home-proxy.mjs
```

Set `ALLOWED_HOSTS` — without it this is an open proxy. The deployed HTTPS app
needs an `https://` proxy URL, so expose it with Tailscale Funnel or Cloudflare
Tunnel and start it with `PUBLIC_ORIGIN` set to that URL — that is what
rewritten HLS manifest URIs point back at, and a wrong value means the manifest
loads while every segment 404s. Full steps in the script's header comment.
(`http://localhost:8899/{url}` works without any tunnel for same-machine
testing — localhost is exempt from mixed-content blocking.)

**Desktop app (macOS/Windows/Linux, no browser):** `desktop/` wraps the
built web app in an Electron window with the proxy embedded on 127.0.0.1 —
zero proxy setup, every provider request leaves from the machine's own IP,
and the renderer keeps all browser security defaults. From a fresh clone:

```bash
npm install
cd desktop
npm install
npm start   # builds the web app, swaps the import map to the vendored
            # Spektrum copy (scripts/package-target.mjs), launches Electron
```

A user-saved proxy template still wins over the embedded default (Settings →
Streaming).

To build an installable artifact instead of running from source:
`cd desktop && npm run package` (or `package:linux`/`package:win`/
`package:mac`) builds the web app, applies the vendored-Spektrum import-map
swap, and runs electron-builder (config: `electron-builder.yml`) into
`release/`. Verified locally: Linux AppImage. Windows (nsis/portable) and
macOS (dmg) configs are in place but unverified in this environment (no
cross-compile toolchain) — cut a `v*` tag to build all three in CI
(`.github/workflows/desktop-build.yml`). Artifacts are unsigned (no
code-signing certificate for a local-build project); expect a Gatekeeper/
SmartScreen warning on first run.

## Standing conventions

- **TypeScript files stay ≤300 lines**, hard ceiling 400
  (`eslint.config.js`'s `max-lines` rule enforces the ceiling; treat 300 as
  the real target and refactor before it bites).
- **No CSS transitions or animations, anywhere.** State changes are instant.
  `eslint.config.js`'s `no-restricted-syntax` rule rejects `transition:`/
  `animation:` string literals in `.ts` files as a first line of defense.
- **Platform APIs (`fetch`, `indexedDB`, `localStorage`, `sessionStorage`,
  `XMLHttpRequest`, `WebSocket`, file inputs) are only ever touched inside
  `src/core/`.** Everything else goes through the adapters defined there —
  `getPlatform().http`/`.storage`/`.files` (Phase 03). Enforced by
  `no-restricted-globals`/`no-restricted-properties`/`no-restricted-syntax`
  in `eslint.config.js`; test against `FakePlatform`
  (`src/core/platform/fake-platform.ts`), never live network/storage.
- **CPU-heavy work runs in a Web Worker, never on the main thread.**
  Playlist parsing (`src/m3u/`, Phase 06) and EPG/XMLTV parsing (`src/epg/`,
  Phase 16) are worker-only by design — the UI thread stays free for
  scrolling and input at all times. `vite.config.ts`'s `worker.format: 'es'`
  plus `new Worker(new URL(...), { type: 'module' })` is the required
  pattern so this keeps working under `base: './'`.
- **Credential-bearing links are not a v1 surface.** Phase 14's reserved
  connect route is deliberately de-scoped until its parse/scrub/persistence
  guarantees are implemented together.
- **Spektrum is the only UI/state framework**, loaded from the pinned,
  integrity-checked same-origin copy. Its template expressions are
  precompiled for a strict script CSP. See "Spektrum: pinned, local, and
  CSP-safe" below.
- **The page is a fixed, full-viewport app shell, not a scrolling document.**
  `html`/`body`/`#app` are sized to exactly 100% of the viewport, and
  `touch-action: manipulation` is set globally to suppress the mobile
  double-tap-to-zoom gesture — deliberately _not_ `user-scalable=no`/
  `maximum-scale` in the viewport meta tag, which would also block
  legitimate pinch-zoom and fail WCAG 1.4.10 (Reflow). Double-tap is the
  only zoom trigger disabled; pinch-zoom still works.

## Spektrum: pinned, local, and CSP-safe

[Spektrum](https://github.com/D-dezeeuw/spektrum) is pinned to `1.1.0`
(`scripts/spektrum-version.json`) and loaded from the integrity-checked
copy at `public/vendor/spektrum.min.js` on every target:

- **Web:** `index.html` resolves the local file through an import map.
- **Electron/webOS:** `scripts/package-target.mjs` rewrites built bare
  imports to the relative local file and removes the import map. This works
  on Chromium 87 without carrying an import-map shim.
- **Strict CSP:** `scripts/spektrum-csp.mjs` precompiles every template
  expression into a static classic script before `bindDOM()`, so the
  runtime never reaches Spektrum's `new Function` fallback.

The vendored runtime is kept in sync (and hash-verified) by
`scripts/sync-vendor-spektrum.mjs` and `scripts/check-importmap.mjs`.

## Who lives where

| Path                 | Owner (phase)                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `src/core/platform/` | Phase 03 — Platform Adapter Layer                                                          |
| `src/core/storage/`  | Phase 04 — Tiered Storage Engine                                                           |
| `src/core/connect/`  | Phase 07 — Playlist Import Flows (`source-key.ts`'s `makeSourceKey`); Phase 14 — Connect Bookmark URLs reuses it |
| `src/core/http/`     | Phase 03 — Platform Adapter Layer                                                          |
| `src/m3u/`           | Phase 06 — M3U Parsing Engine (Web Worker); Phase 07 — Playlist Import Flows (`import*.ts`) |
| `src/channels/`      | Live-view channel filtering — name parsing, curated Dutch catalog, junk detection, variant grouping (see `src/channels/README.md`) |
| `src/epg/`           | Phases 16-18 — EPG Ingestion (Web Worker) / Display / Guide & Mapping                      |
| `src/xtream/`        | Phases 19-21 — Xtream API Client / Live / VOD & Series                                     |
| `src/player/`        | Phases 10-12 — Playback Foundation / Engines / Player UI                                   |
| `src/ui/`            | Phase 08 — Channel List & Virtual Scrolling (virtual-list controller, group filtering, lazy logos, long-press) and onward |
| `src/app/`           | Shell wiring (sidebar, view switching, hash router, settings panel, density — Phase 02) plus the boot sequence (`createPlatform()`/`setPlatform()` — Phase 03) |
| `src/state/`         | Phase 05 — Spektrum State Architecture                                                     |
| `src/shared/testing/`| Test-only harnesses shared across phases (`bind-dom.ts`, Phase 05)                         |
| `src/styles/`        | Phase 02 — App Shell & Design System                                                       |
| `src/types/`         | Ambient declarations (`spektrum.d.ts`)                                                     |
| `scripts/`           | Tooling: Spektrum pin sync/guard, dist checks, packaging swap, M3U fixture generation (Phase 06) |
| `public/vendor/`     | Vendored Spektrum copy — committed, never hand-edited                                      |

**Where does a piece of state live, and does it persist?** `src/state/README.md`
is the module-ownership doc; `masterplan/reference/state-keys.md`
(generated by `scripts/gen-state-keys.mjs` from `src/state/registry.ts`'s
`KEY_REGISTRY` — the single source of truth) is the canonical per-key
answer: type, persistence class, cap, owner, description.

**The `src/core/`-only platform-API rule** is what keeps this table
meaningful: every later phase's code lands in a predictable place, and
nothing outside `src/core/` can quietly grow a direct `fetch`/`indexedDB`
dependency that breaks the Electron/webOS port later.

## Branch flow and tracker

Each phase (epic) from the linked masterplan is implemented on its own
`feature/phase-NN-<slug>` branch, with every task checkbox in the
corresponding phase file checked off as it's completed, verified against
that phase's standing checklist, then merged to `main` and (when
user-visible) deployed.

## Fresh clone

```bash
git clone https://github.com/d-dezeeuw/thundertv
cd thundertv
npm ci
npm run build
npm run lint
```

No undocumented setup steps — if this doesn't pass cleanly, it's a bug.

## License

See [`LICENSE`](./LICENSE) — source-available, non-commercial. Free to view,
run, modify, and fork; selling it, hosting it as a paid or SaaS service, or
folding it into a commercial product requires the copyright holder's
permission.
