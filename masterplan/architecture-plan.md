# ThunderTV — a compact IPTV web app (plan)

A new IPTV project, loosely based on this codebase (thunder-tv / IPTVnator), built
around four constraints:

1. **Compact and easy to distribute** — a static GitHub Pages web app, deployed
   with a single local command, **no GitHub Actions**.
2. **Portable** — the same bundle must later run unchanged inside an Electron
   shell (Windows/macOS/Linux) and remain viable on constrained browsers such
   as **LG webOS** TVs.
3. **Performance first** — heavy caching, no transitions/effects, minimal live
   DOM (windowed lists, lazy loading, adaptive updates).
4. **Zero-friction onboarding** — a bookmarkable URL can carry the user's
   subscription (M3U URL or Xtream credentials) so one visit configures a
   device.

The guiding idea: *minimalistic by default, all the information when you need
it*. Information density on demand, not decoration.

---

## 1. What we take from thunder-tv (and what we deliberately drop)

This codebase is an Nx monorepo with Angular, NgRx, Drizzle/SQLite, embedded
MPV, TMDB enrichment, Stalker portals, mock servers, and multi-target packaging.
That is exactly the weight the new project avoids. But several parts are proven,
framework-independent, and worth porting as plain TypeScript:

**Port (mostly copy + trim):**

- `libs/shared/m3u-utils/` — `playlist.utils.ts` (`createPlaylistObject`,
  group/channel aggregation), `kodiprop.utils.ts` (`extractDrmFromRaw`),
  `catchup.utils.ts`, `strip-country-prefix.util.ts`. All plain TS with specs.
- The patched `iptv-playlist-parser` fork
  (`github:4gray/iptv-playlist-parser#v0.15.2-iptvnator.2`) — battle-tested
  against real-world malformed playlists.
- The **EPG worker approach** from `epg-parser.worker.ts`: XMLTV parsing off the
  main thread, results stored for indexed lookup. Port the concept and the
  program-normalization logic, not the Electron worker plumbing.
- The **Xtream API surface** from `xtream-api.service.ts` /
  `xtream-url.service.ts`: endpoint map, stream-URL construction rules.

**Port as patterns (reimplement small):**

- **Factory/adapter injection** (`DataService` → `ElectronService | PwaService`,
  `IXtreamDataSource` → Electron/PWA implementations). This is the single most
  important architectural idea to keep — it is what makes the later Electron
  move a bolt-on instead of a rewrite. See §4.
- **EnrichedChannel**: pre-compute EPG now/next onto channel rows once per tick
  instead of per-row lookups during render.
- **Global progress tick**: one 30 s interval driving all progress bars, never
  per-item timers.
- **Virtual scrolling + chunked group loading** for 90 000+ channel playlists.

**Drop (out of scope for v1, some forever):**

- Angular/Nx/NgRx, Electron-specific code, SQLite/Drizzle (browser storage
  first, even in Electron initially), Stalker portals, TMDB enrichment,
  embedded MPV / external players, remote control app, mock servers, download
  manager, 19-language i18n (English only; strings centralized so i18n stays
  possible), DRM/DASH (Shaka) — can return later as a lazy-loaded module.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| UI / reactivity | **Spektrum** (npm `spektrum`, loaded **from CDN via import map**, version-pinned) | Tiny reactive engine (~13 KB min / ~5.5 KB gz, zero deps): `setValue`/`computed`/`defineFn` for state, `{{expr}}`, `:attr`, `data-each`, `data-if`, `data-model`, `data-action` HTML bindings, synchronous and deterministic — no virtual DOM. Time-travel (`replay(n)`) is a free debugging tool during development. Spektrum is also the app's state layer — no extra state library. |
| Build | **Vite + TypeScript** for app code; `spektrum` marked external and resolved at runtime by the import map | Instant dev server, one-command static build, `base: './'` works for GitHub Pages, Electron `file://`, and packaged webOS alike. (Spektrum's buildless nature keeps a no-build variant open, but workers + hls.js chunking + TS make one thin build step worth it.) |
| Routing | **Hash-based** (hand-rolled, ~50 lines) | GitHub Pages has no server rewrites (deep links 404 otherwise), Electron serves `file://`, and the hash fragment doubles as the credential-carrying bookmark channel (§7) — one mechanism, three jobs. |
| Storage | **Tiered `StorageAdapter`**: IndexedDB → localStorage (small data) → in-memory (§5) | IndexedDB is not a given on every target (TV browsers, private modes, embedded webviews) — capability is probed at boot and the app degrades gracefully instead of breaking. |
| Live playback | **hls.js** (lazy-loaded), native HLS on Safari, **mpegts.js** (lazy) for raw `.ts` streams | Covers the overwhelming majority of IPTV sources. Loaded only when playback starts — the browse UI ships without any player code. |
| Styling | Hand-rolled CSS with custom properties, system font stack, dark theme default | No CSS framework, no transitions/animations. |
| Parsing | **Web Workers** for M3U and XMLTV | Main thread stays idle during 100 MB playlist/EPG imports. |

**CDN details:** the import map in `index.html` pins an exact version
(e.g. `unpkg.com/spektrum@1.1.0` or jsDelivr equivalent). Two portability
notes, handled up front:

- **Offline/packaged targets** (Electron, webOS app, PWA offline): a pinned
  copy of `spektrum.min.js` is vendored in `public/vendor/`; the packaged
  builds' import map points there instead of the CDN — a one-line swap. Web
  stays CDN-first as requested; the PWA service worker (M5) caches the CDN
  file after first load.
- **Old engines:** import maps require Chromium 89+ / Safari 16.4+. Recent LG
  webOS is fine, older TV firmware is not — the webOS target includes
  `es-module-shims` (~9 KB, only fetched when import maps are unsupported) or
  simply uses the vendored-file variant.

**Spektrum usage rules for this app:** templates live in `index.html` /
per-view HTML partials with `data-*` bindings; app logic in TS modules calls
`setValue`/`computed`/`defineFn`. The virtual list (§6) feeds `data-each` only
the *windowed slice* (≤ ~40 rows) — Spektrum reconciles that slice; the full
90 k array never reaches the DOM layer. Time-travel history is capped or
disabled in production builds so 90 k-row mutations don't accumulate.

---

## 3. Repository and distribution

**New standalone repository** (suggested name: `thundertv`). The Nx monorepo
stays untouched as the reference implementation. Porting into a fresh repo keeps
the "compact" promise honest — no workspace machinery, one `package.json`.

```
thundertv/
├── index.html                # import map (CDN spektrum), app shell markup
├── vite.config.ts            # base: './', spektrum external, worker bundling,
│                             # manualChunks for player engines
├── package.json              # deploy = "vite build && gh-pages -d dist"
├── src/
│   ├── main.ts               # bootstrap: platform + storage probe, connect-URL
│   ├── app/                  # shell wiring: sidebar, view switching, hash router
│   ├── core/
│   │   ├── platform/         # PlatformAdapter interface + WebPlatform impl (§4)
│   │   ├── storage/          # StorageAdapter tiers: idb / local / memory (§5)
│   │   ├── connect/          # bookmark-URL parsing + generation (§7)
│   │   └── http/             # fetch wrapper: timeout, CORS classification, proxy
│   ├── m3u/                  # ported utils + parser worker
│   ├── epg/                  # XMLTV worker, program index, now/next resolver
│   ├── xtream/               # API client + lazy category/stream loading
│   ├── player/               # player host, lazy hls.js / mpegts.js engines
│   ├── ui/                   # virtual-list windowing, view partials + bindings
│   └── styles/               # tokens.css, base.css (no animations)
├── public/
│   └── vendor/spektrum.min.js  # pinned copy for offline/packaged targets
└── scripts/                  # optional deploy helper
```

**Deploy without Actions:** `npm run deploy` → `vite build` +
`npx gh-pages -d dist` pushes `dist/` to the `gh-pages` branch from the local
machine. (Alternative: build into `docs/` on `main` and point Pages at it —
choose one, both are Actions-free.) `base: './'` makes the same `dist/` load
from a Pages subpath *and* from `file://` in Electron later.

**File-size discipline:** adopt this repo's rule — files under 300 lines, hard
max ~400. At the target scope the whole app should stay under ~40 source files.

---

## 4. Platform adapter — the Electron/webOS insurance policy

One interface, injected once at bootstrap, mirroring the `DataFactory()` pattern
here:

```ts
interface PlatformAdapter {
    storage: StorageAdapter;      // tiered browser storage now; SQLite-over-IPC later
    http: HttpAdapter;            // fetch now; net.request via IPC later (no CORS)
    files: FileAdapter;           // <input type=file> now; native dialogs later
    capabilities: {
        corsUnrestricted: boolean;   // false on web → drives UX in §8
        externalPlayers: boolean;    // false on web
        durableStorage: 'full' | 'partial' | 'none'; // result of the boot probe (§5)
    };
}
```

Rules that keep the ports cheap:

- **Nothing outside `core/` touches `fetch`, `indexedDB`, `localStorage`, or
  file inputs directly.** Enforced by a lint rule (`no-restricted-globals`
  outside the adapter folders).
- Detection stays identical to this repo: `window.electron` truthy → Electron
  adapter, else web adapter (webOS is the web adapter + storage probe + the
  import-map fallback from §2).
- The Electron phase (§9) then means: a small main process, a preload bridge,
  one new adapter implementation. Zero UI changes.

---

## 5. Storage — tiered, probe-based, always functional

IndexedDB cannot be assumed everywhere (older/odd TV browsers, private
browsing modes, some embedded webviews expose it but fail on `open`). Instead
of one storage backend, `core/storage/` implements one interface with three
tiers, selected by a **boot-time probe** (actually open a test DB and
round-trip a value — presence of `window.indexedDB` alone is not proof):

| Tier | Backend | What persists | When |
|---|---|---|---|
| **full** | IndexedDB (via `idb`, ~1 KB) | Everything: parsed channels, EPG programs, playlists, settings, favorites, recent | Normal browsers, GitHub Pages, Electron, recent webOS |
| **partial** | localStorage (JSON, chunked, ~5 MB budget) | The *small, valuable* data only: settings, playlist/source definitions (URLs, Xtream credentials), favorites, recent | IDB probe fails but localStorage works |
| **none** | In-memory only | Nothing across reloads; everything within the session | Both probes fail (last resort) |

Design points:

- **The in-memory database is not a fallback — it is the primary query layer
  on every tier.** The active playlist's channels always load into plain
  arrays (a 90 k-row array of small objects is a few MB); search, filtering,
  and group views run over memory. Durable tiers only decide what survives a
  reload. This means tier degradation changes *boot behavior*, never feature
  behavior.
- **Graceful degradation on `partial`:** source definitions survive, bulk data
  doesn't — so on boot the app re-fetches and re-parses URL/Xtream sources in
  the worker (a few seconds, with progress shown) instead of reading parsed
  rows from IDB. File-based playlists prompt for re-upload. EPG re-fetches or
  is skipped. A subtle one-line notice explains the mode ("storage limited on
  this device — playlists reload on start").
- **Favorites/recent are denormalized snapshots** (name, stream URL, logo,
  group — not just channel ids). They fit comfortably in localStorage and stay
  *instantly usable* after reboot on the partial tier, before any playlist has
  re-parsed — favorites become the fast path on constrained devices.
- **Not in a worker:** keeping the store in a worker was considered and
  rejected — workers don't survive reloads (no persistence win) and every
  query would pay structured-clone messaging cost (a performance loss).
  Workers stay what they are: parsers. Parse results are written to the
  storage tier in chunks (~5 000 rows) from the main thread.
- The `StorageAdapter` API is async and identical across tiers, so the later
  Electron SQLite option (if profiling ever demands it) is just a fourth
  implementation.

### IndexedDB layout (full tier)

| Store | Key | Notes |
|---|---|---|
| `playlists` | `id` | Source meta: type (`m3u-url`, `m3u-file`, `m3u-text`, `xtream`), URL/credentials, name, counts, `lastRefresh`, HTTP `etag`/`lastModified`. |
| `channels` | `[playlistId, index]` | **Parsed** channel rows (never re-parse raw text). Bulk `put` in chunks. |
| `groups` | `[playlistId, name]` | Group → channel-count + first-index, for instant group view. |
| `epgChannels` / `epgPrograms` | id / `[channelId, start]` | Programs range-queried by time via IDB index; old programs pruned on import. |
| `favorites`, `recent` | composite | Denormalized (see above), capped (recent ≤ 100). |
| `settings` | key | JSON blob per key, mirrored into Spektrum state at boot. |

### Caching rules

- **Parse once, read forever** (full tier). Raw M3U/XMLTV text is discarded
  after the worker parses it. Cold start with a cached 90 k-channel playlist
  must not touch the network.
- **Conditional refresh.** URL playlists refresh manually (button) or on a
  configurable staleness window — with `If-None-Match`/`If-Modified-Since`
  when the server cooperates; `304` → skip the parse entirely.
- **EPG on demand.** Now/next for *visible* rows only, resolved in batch per
  global tick; full-day timelines fetched only when a program panel is opened.

### Performance budgets (checked manually before each release)

- Initial JS ≤ ~60 KB gzipped app code + ~6 KB Spektrum (no player engines).
- Cold start to interactive channel list (cached playlist, full tier) < 1 s.
- 100 k-channel M3U import: parse + persist < 5 s, UI never blocked.
- Scrolling a 90 k list: no dropped frames; DOM ≤ ~40 channel rows at any time.
- Search keystroke → filtered list < 50 ms (debounced 150 ms, incremental
  filter over the previous result set while the query only grows).

---

## 6. Virtual list × Spektrum

The one place where "minimal DOM" and the framework meet:

- A small windowing controller (hand-rolled, ~150 lines) owns scroll math:
  fixed row height (density setting: compact 32 px / comfortable 44 px), so
  no measuring ever happens; viewport + overscan ≈ ≤ 40 rows.
- The controller writes the visible slice into one Spektrum value
  (`setValue('visibleRows', slice)`); the template renders it with a single
  `data-each` container. Scrolling replaces the slice; Spektrum's
  reconciliation touches only changed rows.
- Row content (EPG now/next, progress) updates by mutating the slice on the
  global 30 s tick — never via per-row timers or bindings.

---

## 7. Bookmark connect URLs — subscription in a link

A bookmark should be able to fully configure a device (especially valuable on
TVs, where typing credentials is miserable). Mechanism:

- **Hash fragment, never query string.** Fragments are not sent to the server
  (nothing in GitHub Pages logs, proxies, or referrers) and the hash router
  already owns them. Format:

  ```
  https://<user>.github.io/thundertv/#/connect?type=xtream&url=http%3A%2F%2Fhost%3A8080&user=abc&pass=xyz&name=My%20Sub
  https://<user>.github.io/thundertv/#/connect?type=m3u&url=<m3u-url>&epg=<xmltv-url>&name=Home
  ```

- **Boot behavior:** `core/connect/` parses the fragment before first render.
  A matching existing source (keyed by `type+url+user`) is updated, otherwise
  created; the app lands directly on that source's channel list; then
  `history.replaceState` scrubs the credentials from the address bar (the
  bookmark itself keeps them — that is its job). `&save=0` opts out of
  persisting credentials (session-only, for shared machines).
- **Generation, not just consumption:** Settings → Streaming gets a
  "Copy bookmark link" action per source that assembles this URL, with a
  plain-words warning that the link embeds credentials and should be treated
  like a password. (A QR render of the same link is a cheap later addition for
  phone → TV handoff.)
- **Security posture, stated honestly in the UI:** credentials in a bookmark
  are stored wherever bookmarks sync. That is the user's explicit tradeoff to
  make; the app's obligations are: fragment-only transport, immediate scrub
  from the visible URL, never logging the fragment, and no third-party
  requests before the scrub.
- **CORS still applies** (§8): on the plain web target, an Xtream bookmark
  works only if the provider sends CORS headers or a proxy is configured — the
  connect flow surfaces that with the same classified error UX, and the
  bookmark still saves the source so it works immediately in Electron/proxy
  setups.

---

## 8. The CORS reality (must be designed in, not patched later)

A static Pages app cannot proxy requests, and most IPTV providers do not send
CORS headers. This is the one honest limitation of web distribution, and this
repo's `apps/web-backend` exists precisely to solve it for the PWA. Without a
server, the plan is:

1. **Always-working paths first:** file upload and paste-as-text import are the
   primary M3U flows and never hit CORS.
2. **Direct URL fetch, classified failure.** Try the fetch; on a CORS-shaped
   failure show a *specific* explanation (not a generic error) with the
   working alternatives: download-and-upload, or configure a proxy.
3. **Optional user-configured proxy** (Settings → Streaming): a URL template
   like `https://my-proxy/{url}` applied by the `http` adapter to playlist,
   EPG, and Xtream API calls. Empty by default; we ship no public proxy and
   make no promises. *Note: video segments themselves are fetched by
   hls.js/mpegts.js and are CORS-bound too on the web — set expectations in
   the UI.*
4. **Electron erases the limitation** (main-process requests have no CORS);
   `capabilities.corsUnrestricted` flips and the warnings disappear. A
   packaged webOS app similarly relaxes cross-origin rules relative to the
   plain TV browser.

---

## 9. UI plan — minimal by default, dense on demand

### Layout

```
┌──────┬──────────────────────────────────────────────┐
│      │  [search…]                    [group filter] │
│ Side │──────────────────────────────────────────────│
│ bar  │  ▸ channel row  (logo · name · now playing)  │
│      │  ▸ channel row                               │
│ 56px │  ▸ channel row      ← windowed virtual list  │
│ icon │  …                                           │
│ rail │──────────────────────────────────────────────│
│      │  player dock (only when playing)             │
└──────┴──────────────────────────────────────────────┘
```

- **Left sidebar = icon rail (~56 px)**, per the "small left bar" requirement:
  Sources (playlists), Favorites, Recent, EPG/Guide, Settings. Clicking
  Settings slides a panel over the rail (no route change, no animation — it
  appears) with sections: **User** (profile name, favorites/recent behavior),
  **Streaming** (playlists CRUD: add M3U by file/URL/text, Xtream credentials,
  refresh policy, proxy URL, EPG sources, per-source "Copy bookmark link"),
  **Playback** (preferred engine, autoplay, volume memory), **Appearance**
  (theme, density).
- **Home** = active playlist's channel list. No dashboard, no hero, no rails.
  First run (no playlists) shows a single centered import card — file, paste,
  URL, Xtream, and a note that a connect bookmark (§7) skips this entirely.
- **Channel row** is one flex line: logo (lazy `<img loading="lazy">`, fixed
  box to avoid layout shift), name, and — only when EPG exists — current
  program + a thin progress bar. Right-click/long-press → favorite toggle.
- **Information on demand:** clicking the row's EPG area (not the row itself)
  expands an inline now/next detail; a dedicated Guide view shows a simple
  time-grid for favorited channels only (bounded, cheap). No multi-EPG wall.
- **Player**: clicking a channel plays in a bottom dock (list stays usable);
  double-click or an expand button goes theater (list collapses to the rail).
  Engine picked by URL: `.m3u8` → hls.js (or native on Safari), `.ts` →
  mpegts.js, otherwise plain `<video>`. Engines are dynamic `import()`s.
- **VOD/series (Xtream, M4):** same list UI with a poster grid alternative;
  detail is an inline expanding panel, not a separate hero page.

### Anti-jank rules (enforced, not aspirational)

- No CSS transitions/animations anywhere; state changes are instant.
- Windowed list per §6; recycled rows; fixed row heights, never measured.
- `content-visibility: auto` on off-screen panels.
- No layout thrash: logos in fixed-size boxes, text truncates with ellipsis.
- Keyboard-first: ↑/↓ navigate, Enter plays, `/` focuses search, `f`
  favorites, `m` mute, ←/→ channel zap while playing. (This is also the webOS
  remote-control story — arrow/OK navigation falls out of it for free.)

---

## 10. Milestones

Each milestone ends deployable (`npm run deploy`) and manually verified against
the §5 budgets.

- **M0 — Skeleton (small):** Vite + TS scaffold with the Spektrum import map
  (CDN, pinned) and vendored fallback copy, ESLint + max-lines rule, platform
  adapter + **storage probe with all three tiers stubbed**, hash router, icon
  rail + empty states, tokens.css, `gh-pages` deploy proven on a real Pages
  URL.
- **M1 — M3U + playback (the real MVP):** import via file/paste/URL (with §8
  CORS handling), parser worker (ported utils + `iptv-playlist-parser`),
  full-tier persistence + partial/none degradation paths, virtual channel
  list (§6) with search + group filter, hls.js/mpegts.js lazy playback in
  dock + theater mode, volume persistence.
- **M2 — Daily-driver polish:** favorites + recent (denormalized, global),
  **connect bookmark URLs (§7: parse + generate + scrub)**, multi-playlist
  management (rename/refresh/delete, conditional refresh), keyboard
  navigation, error surfaces for dead streams (retry / try-other-engine).
- **M3 — EPG:** XMLTV import (URL/file, gz supported) in a worker, program
  index with pruning, EnrichedChannel now/next + global progress tick, inline
  program detail, favorites-only Guide grid, manual channel↔EPG mapping stub
  (`tvg-id` matching first; port the mapping-key idea only if needed).
- **M4 — Xtream Codes:** credentials in Settings → Streaming and via connect
  bookmark, lazy category/stream loading (API-only, mirroring the PWA data
  source here), live + VOD + basic series with the inline detail panel, same
  caching rules.
- **M5 — Optional web niceties:** installable PWA (manifest + minimal service
  worker caching the app shell **and the pinned Spektrum CDN file** — never
  media), import/export of settings+playlists as JSON, English strings
  centralized for future i18n.
- **M6 — Electron shell (separate small repo or `electron/` folder):**
  minimal main process loading the same `dist/` via `file://` with the
  vendored-Spektrum import map, preload bridge, `ElectronPlatformAdapter`
  (main-process HTTP → CORS gone; native file dialogs). Keep browser storage
  initially — SQLite only if profiling demands it. electron-builder for
  Windows/macOS portable builds. Later, optional external-player launch
  (MPV/VLC) behind `capabilities.externalPlayers`.
- **M7 — webOS exploration (stretch):** package the same `dist/` as a webOS
  web app (`appinfo.json` + ares-cli), vendored Spektrum (or
  `es-module-shims` where import maps are missing), storage probe decides the
  tier, remote navigation already covered by keyboard-first UI. Validate MSE
  + hls.js on real hardware early — this milestone is exploratory by design.

Non-goals for v1 (revisit only on real demand): Stalker portals, TMDB, DRM/DASH,
downloads, remote control app, multi-user profiles, catchup/timeshift (the
ported `catchup.utils.ts` keeps the door open).

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| CORS makes URL imports feel broken on the web | Designed-in UX (§8): file/paste first-class, specific errors, proxy setting, Electron as the advertised full-featured mode. |
| Mixed content: Pages is HTTPS, many streams are HTTP | Detect `http://` streams on an `https://` origin and say so explicitly (browser will silently block). Electron/webOS-app modes unaffected. |
| CDN dependency for the framework | Pinned version (reproducible), vendored copy for packaged targets, service worker caches it for PWA offline. A CDN outage degrades only first-visit web loads. |
| Import maps unsupported on old TV browsers | `es-module-shims` polyfill or the vendored-file import path for the webOS target; plain web assumes evergreen browsers. |
| Credentials in bookmark URLs leak | Fragment-only transport (never sent to servers), immediate `replaceState` scrub, `&save=0` session mode, explicit plain-words warning at link generation. Residual risk (bookmark sync stores) is the user's stated tradeoff. |
| IndexedDB unavailable/broken on a target | Tiered storage (§5) with a real boot probe; app remains fully functional in-memory, sources re-parse on boot, favorites survive via localStorage snapshots. |
| Storage probe misclassifies (IDB opens but writes fail later) | Writes go through the adapter; on runtime IDB failure it demotes to the partial tier for the session and re-probes next boot. |
| 100 MB playlists blow up memory/IDB | Chunked worker → storage streaming writes; session array holds only active playlist; counts shown during import. |
| Spektrum time-travel history grows with bulk mutations | History capped/disabled in production; bulk imports write through the storage layer, not through recorded UI state. |
| EPG data growth | Prune programs older than 24 h on every import; cap per-channel horizon (e.g. 3 days). |
| Scope creep back toward IPTVnator | The non-goals list above is part of the definition of done; new features must fit the §5 budgets or be lazy-loaded. |

---

## 12. First concrete steps (M0 checklist)

1. Create `thundertv` repo; scaffold Vite (vanilla-ts template).
2. Add the import map to `index.html` pinning `spektrum@1.1.0` from the CDN;
   vendor `spektrum.min.js` into `public/vendor/`; mark `spektrum` external in
   `vite.config.ts`.
3. Add ESLint (+ `max-lines` 400), Prettier, strict tsconfig.
4. Implement `PlatformAdapter` + `WebPlatform`; implement the storage probe
   and the three `StorageAdapter` tiers (memory first — it's the reference
   implementation the other two must match).
5. Build the icon rail + settings panel shell with Spektrum bindings and
   tokens.css (dark default); hand-rolled hash router with a `/connect` stub.
6. Add `gh-pages` dev-dependency, `deploy` script, set `base: './'`, verify a
   deployed hello-world on `https://<user>.github.io/thundertv/`.
7. Port `m3u-utils` files + their specs (Vitest) from this repo as `src/m3u/`.
