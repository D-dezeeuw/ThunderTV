# Phase 24 — PWA & Offline Shell

> **Epic goal:** ThunderTV becomes installable and offline-bootable: a small hand-written service worker precaches the app shell and runtime-caches exactly one URL — the pinned Spektrum CDN file — with a consent-based update flow and a documented kill-switch, while media and playlist data stay permanently uncacheable.
> **Verification:** The deployed build installs from Chrome and Edge via the About entry; with the network blocked, a reload boots the cached shell into a browsable full-tier session; after a browse-and-play session, Cache Storage contains exactly the versioned shell cache and the pinned Spektrum entry — no media, segments, logos, or playlist data; a redeploy surfaces the unobtrusive update notice and consent migrates cache names; the kill-switch drill unregisters and purges while the app still boots from network; `npm run test:pwa` (offline smoke, update simulation, cache-name migration, media non-interference) and the standing `npm test`/build/tsc/ESLint checks are green, and the first `docs/pwa-audit.md` protocol run is recorded.

Before this phase, the deployed Pages build is a plain web app: offline reloads fail, the pinned Spektrum CDN file is a hard dependency on every visit, and nothing is installable. After it, `public/manifest.webmanifest` plus a hand-written `public/sw.js` make the shell boot offline — cache-first serving under versioned cache names from a build-generated precache manifest — the pinned unpkg Spektrum URL is the single runtime-cached exception per plan M5, updates arrive as one unobtrusive reload prompt honoring `skipWaiting` only on consent, an explicit deny-by-default fetch handler keeps streams, segments, logos, and playlist data out of the Cache API forever, installation lives as one subtle About entry, and a kill-switch build plus a dedicated verification suite make a bad SW deploy recoverable. Packaged targets (Electron, webOS) never register any of it — they use the vendored `public/vendor/spektrum.min.js`.

## Feature 24.1 — Web app manifest and icons

Installability starts with an honest manifest: name, dark theme colors, a real icon set, standalone display — all relative-pathed so the same file works on the Pages subpath and is harmlessly ignored by packaged targets.

- [ ] **24.1.1** Manifest file — create `public/manifest.webmanifest` with name/short_name/description, `start_url: './'`, `scope: './'`, `display: 'standalone'`, and `background_color`/`theme_color` matching the `tokens.css` dark surface.
- [ ] **24.1.2** Icon set — generate 192 px and 512 px PNGs plus maskable variants into `public/icons/` from one committed SVG via `scripts/gen-icons.mjs`, with the generation documented in the script header.
- [ ] **24.1.3** Head wiring — add `<link rel="manifest">` and the `theme-color` meta to `index.html`; keep every manifest URL relative so `/thundertv/` subpath hosting resolves and `file://` packaged builds ignore it gracefully.
- [ ] **24.1.4** iOS fallbacks — add `apple-touch-icon` and the Apple mobile-web-app meta tags, since Safari honors only part of the manifest.
- [ ] **24.1.5** Route shortcuts — declare manifest `shortcuts` for Favorites and Settings pointing at their hash routes, giving installed users direct entries.
- [ ] **24.1.6** Strings alignment — source the manifest's name and description from the same values as the strings module via a small build-time generation step, so app naming has one home.
- [ ] **24.1.7** Orientation stance — set `orientation: 'any'` (desktop windows and landscape TVs both matter) and record the decision.
- [ ] **24.1.8** Precache membership — add the manifest and icons to the 24.2 precache manifest so the installed identity survives offline.
- [ ] **24.1.9** Manifest test — a unit test parses the manifest asserting required installability fields, relative URLs only, and that every referenced icon file exists on disk.
- [ ] **24.1.10** DevTools validation — verify zero manifest warnings in the Chrome Application panel against the built `dist/` and record the check here.

## Feature 24.2 — Service worker app-shell caching

The service worker is small, hand-written, and boring on purpose: a build-generated precache manifest, cache-first serving under a versioned cache name, and cleanup on activate — no framework, no runtime cleverness.

- [ ] **24.2.1** Hand-written worker — author `public/sw.js` as dependency-free plain JS under the 300-line target, linted by the flat ESLint config; no workbox, no bundler magic inside the worker.
- [ ] **24.2.2** Build-time precache manifest — emit the hashed built-asset list (index.html, JS/CSS chunks, icons, manifest, `public/vendor/spektrum.min.js`) into a generated `sw-manifest.js` pulled in via `importScripts`, wired as a small Vite build step.
- [ ] **24.2.3** Versioned cache name — derive `shell-v{buildHash}` from the build so every deploy owns a distinct cache; the version constant lives in the generated manifest.
- [ ] **24.2.4** Install precache — `install` runs `cache.addAll` over the manifest; a single failed asset fails the whole install, because a half-cached shell is worse than none.
- [ ] **24.2.5** Activate cleanup — `activate` deletes every cache not matching the current shell/spektrum names, then calls `clients.claim()`.
- [ ] **24.2.6** Cache-first fetch — serve precached same-origin assets cache-first with no runtime revalidation — the version bump is the only invalidation, by design (decision note).
- [ ] **24.2.7** Navigation fallback — respond to navigation requests with the cached `index.html`; the hash router owns everything after that.
- [ ] **24.2.8** Guarded registration — register the SW through `core/platform` only on production `https:` origins — never on the dev server, never on `file://` packaged targets (capability-checked, so Electron/webOS stay SW-free).
- [ ] **24.2.9** Lifecycle diagnostics — log registration, waiting, and `controllerchange` events from the page side through the Phase 23 diagnostics buffer under `area: 'sw'`.
- [ ] **24.2.10** Offline shell smoke — serve built `dist/` locally, go offline, reload, and verify the shell boots from cache; record the result here (the full experience is verified in Feature 24.5).

## Feature 24.3 — Pinned Spektrum CDN caching

The one runtime-cache exception, honoring the plan's M5 note: the exact pinned unpkg Spektrum URL is cached after first load so the CDN dependency degrades to first-visit-only — and nothing else from any CDN ever gets this treatment.

- [ ] **24.3.1** Pin extraction — extract the pinned Spektrum URL from the `index.html` import map at build time into the generated `sw-manifest.js`, so the SW's pin can never drift from the import map's.
- [ ] **24.3.2** Exact-match rule — match the runtime cache by full URL equality against the pin — never by origin or path prefix; no other unpkg URL is ever cached.
- [ ] **24.3.3** Cache-first with fill — serve from the `spektrum-v{version}` cache when present; otherwise fetch, and `cache.put` only a 200-status, non-opaque-redirect response.
- [ ] **24.3.4** Version rotation — a version bump in the import map creates a new spektrum cache name; the activate cleanup (24.2.5) drops the old one alongside stale shell caches.
- [ ] **24.3.5** Residual-risk note — document that a purged cache plus a CDN outage breaks web boot, matching §11's accepted risk (outages degrade first-visit loads); packaged targets are immune via the vendored copy.
- [ ] **24.3.6** Packaged-target guard — assert the registration guard means Electron/webOS builds — which resolve Spektrum from `public/vendor/` — never register this SW at all.
- [ ] **24.3.7** Routing helper — factor the fetch-routing decision (precache / spektrum-pin / denylist / passthrough) into a pure function inside `sw.js`, exported for tests via a worker-global shim.
- [ ] **24.3.8** Cache-source indicator — surface whether Spektrum loaded from the SW cache or the network (Resource Timing heuristics) on the About row from 22.9.5.
- [ ] **24.3.9** CDN-block verification — with unpkg blocked in DevTools after one online load, reload and verify the app boots from the SW cache; record the check here.
- [ ] **24.3.10** Pin unit tests — assert exact-URL matching (query-string variants and other unpkg paths fall through) and the 200-only `put` guard in the routing-helper tests.

## Feature 24.4 — Update flow

Updates respect the session: a waiting worker surfaces as one unobtrusive reload prompt, `skipWaiting` fires only on consent, and pending persistence is flushed before the reload — no auto-refresh, ever.

- [ ] **24.4.1** Waiting detection — watch `registration.updatefound` and the installing worker's state; a worker reaching `installed` with an existing controller publishes `sw.updateReady`.
- [ ] **24.4.2** Unobtrusive prompt — render one line in the notice slot ("update ready — reload when convenient") with a Reload action; no modal, no countdown, no re-nag after dismissal.
- [ ] **24.4.3** Consent skipWaiting — the Reload action posts `{type: 'SKIP_WAITING'}` to the waiting worker; `sw.js` calls `self.skipWaiting()` only on that message — never unprompted (decision note in the worker header).
- [ ] **24.4.4** Single reload — on `controllerchange`, reload once behind a guard flag so a misbehaving worker cannot loop the page.
- [ ] **24.4.5** Flush before reload — reuse the 23.7.2 persistence flush before the consented reload so no debounced settings/resume write is lost to the update.
- [ ] **24.4.6** Throttled checks — call `registration.update()` when the app returns to visibility, throttled to once per hour — silent, with no UI on "no update".
- [ ] **24.4.7** Dismiss semantics — dismissing hides the prompt for the session; the new version applies naturally on the next full load.
- [ ] **24.4.8** Keyboard path — the notice's Reload action is focusable and Enter-activated, consistent with the ErrorSurface action pattern.
- [ ] **24.4.9** Version visibility — after the reload, About shows the new version and build date, making a successful update user-verifiable.
- [ ] **24.4.10** Update-flow tests — with mocked registration objects, drive `updatefound` → `updateReady` → SKIP_WAITING → `controllerchange` and assert the single-reload guard and the flush ordering.

## Feature 24.5 — Offline boot experience

Offline is a first-class boot path, not an error page: the cached shell plus tiered storage produce a fully browsable session, refreshes queue quietly, and playback says plainly why it cannot start.

- [ ] **24.5.1** Full-tier offline boot — verify the complete §6.4 boot order works offline: cached shell loads, storage rehydrates, the last session's channel row renders, and the list is browsable with zero network.
- [ ] **24.5.2** Boot-time net wiring — feed `net.online` (Feature 23.4) into boot so refresh-on-start policies skip silently while offline instead of surfacing launch errors.
- [ ] **24.5.3** Engine chunks precached — verify the lazy player-engine chunks (hls.js, mpegts.js) are part of the built-asset precache, so an offline playback failure is about the missing stream, never about missing app code.
- [ ] **24.5.4** Partial-tier offline — on the partial tier offline, render the combined explanation (storage limited + offline) and keep favorites/recent instantly usable from their denormalized snapshots — the plan §5 fast path, proven offline.
- [ ] **24.5.5** EPG continuity — now/next keeps deriving from the persisted program index offline; queued EPG refreshes drain on reconnect per 23.4.5.
- [ ] **24.5.6** Artwork degradation — logos and posters fall back to placeholders through the 21.8 error path while offline — the SW never serves them (Feature 24.6's denylist).
- [ ] **24.5.7** Connect-URL offline — a `#/connect` visit while offline still saves the source (fragment parsing is local) and surfaces the classified offline error for the fetch, honoring §7's "the bookmark took" promise.
- [ ] **24.5.8** Status transparency — About shows offline status beside the SW cache status (the 22.9.7 slots), giving support one place to look.
- [ ] **24.5.9** Tier matrix smoke — manually verify offline reload behavior on the full, partial, and none tiers against built `dist/`, recording each behavior here.
- [ ] **24.5.10** Zero-request audit — during an offline full-tier boot, assert via the network log that no requests leave the app beyond the failed connectivity probe.

## Feature 24.6 — Never-cache-media rules

The masterplan rule is absolute — the SW caches the shell and the pinned Spektrum file only — so the fetch handler enforces a deny-by-default posture plus an explicit media/data denylist as defense in depth.

- [ ] **24.6.1** Deny by default — the routing helper's final branch is always network passthrough: only precache membership and the exact Spektrum pin can ever be served from or stored into a cache.
- [ ] **24.6.2** Explicit denylist — add pattern checks for stream/media URLs (`.m3u8`, `.ts`, `.m4s`, `.mp4`, `.mkv`, `/live/`, `/movie/`, `/series/`) and playlist/EPG/API endpoints (`get.php`, `player_api.php`, `.xml`, `.xml.gz`) that hard-bypass caching even if a future refactor breaks the default.
- [ ] **24.6.3** Range bypass — requests carrying a `Range` header bypass the cache entirely — the Cache API mishandles partial responses and media seeking depends on them.
- [ ] **24.6.4** Non-GET bypass — return early on any non-GET method before touching caches.
- [ ] **24.6.5** Image passthrough — logo and poster requests (cross-origin images) pass through untouched, so the SW never turns artwork hosts into unbounded cache growth.
- [ ] **24.6.6** No credential logging — credential-shaped URLs (Xtream paths, `get.php` queries) are matched for bypass but never logged from the worker; SW-side logging stays URL-free.
- [ ] **24.6.7** Shared pattern table — keep the denylist patterns in one const consumed by both `sw.js` and the tests, with a comment citing the masterplan shell-plus-Spektrum-only rule.
- [ ] **24.6.8** Routing table tests — table-test the helper across segment URLs, movie URLs with fake credentials, `player_api.php` actions, the Spektrum pin, hashed chunks, and Range requests, asserting cache-vs-passthrough for each.
- [ ] **24.6.9** Post-play audit — after a browse-and-play session on built `dist/`, inspect Cache Storage and assert exactly two cache names (shell, spektrum) with no media or data entries; record the evidence.
- [ ] **24.6.10** Storage estimate line — surface `navigator.storage.estimate()` in About and manually confirm SW caches stay in the low single-digit MB after the audit session.

## Feature 24.7 — Install prompt UX

Installation is offered exactly once and exactly where it belongs — a subtle entry in About driven by `beforeinstallprompt` — with zero banners, zero toasts, and zero nagging anywhere else in the app.

- [ ] **24.7.1** Event capture — capture `beforeinstallprompt` in `core/platform` (preventDefault, stash the event), publishing a `pwa.canInstall` value; the event object never leaves the adapter.
- [ ] **24.7.2** About entry — fill the reserved 22.9.7 slot with an "Install app" row visible via `data-if` only while `pwa.canInstall` is true — the app's only install affordance.
- [ ] **24.7.3** Prompt invocation — activation calls the stashed event's `prompt()`, records the `userChoice` outcome to diagnostics, and clears the stash either way.
- [ ] **24.7.4** Installed detection — hide the entry when running standalone (`matchMedia('(display-mode: standalone)')`) or after the `appinstalled` event, replacing it with a quiet "installed" line.
- [ ] **24.7.5** No-event browsers — on browsers without `beforeinstallprompt` (Safari, Firefox), show a static one-line hint in About pointing at the browser's own Add-to-Home-Screen/Dock flow — still no prompting.
- [ ] **24.7.6** Respect dismissal — a dismissed prompt is never re-asked by the app; the row simply remains for whenever the user returns (the browser's own re-fire policy governs availability).
- [ ] **24.7.7** Non-serializable stash — keep the stashed event session-only and out of every persistence path (it cannot be serialized; the schema module's key allowlist makes this structural).
- [ ] **24.7.8** Keyboard activation — the install row follows the panel's focus/Enter conventions like every other settings row.
- [ ] **24.7.9** Strings compliance — the install row, installed line, and fallback hint all resolve through strings-module keys.
- [ ] **24.7.10** Two-browser verify — manually install from Chrome and Edge: entry appears, prompt shows, and the installed app launches standalone into the shell; record both runs.

## Feature 24.8 — PWA audit protocol

A written, repeatable audit replaces "it seemed installable": Lighthouse plus the DevTools installability checks, two-browser install verification, the cache-contents rule, and a redeploy-update drill — executed against the real Pages URL and recorded.

- [ ] **24.8.1** Protocol document — create `docs/pwa-audit.md` with the full checklist, environment notes, and a results table (date, app version, browser versions, pass/fail per row).
- [ ] **24.8.2** Lighthouse pass — run Lighthouse (performance and best-practices categories) plus the DevTools Application-panel installability checks against the deployed Pages URL — not localhost — and file the scores.
- [ ] **24.8.3** Budget guard — confirm the §3 budgets still hold post-SW (initial JS ≤ ~60 KB gz app code, cold start < 1 s with a cached playlist) — the SW must never regress first load.
- [ ] **24.8.4** Install rows — verify installability on Chrome and Edge per 24.7.10's procedure as protocol rows, with iOS Safari's Add-to-Home-Screen behavior noted separately.
- [ ] **24.8.5** Offline row — an offline-reload protocol row referencing the 24.5.9 tier matrix as its procedure.
- [ ] **24.8.6** Cache-rule row — a cache-contents protocol row referencing the 24.6.9 audit procedure, passing only when exactly the two expected caches exist.
- [ ] **24.8.7** Update drill — redeploy with a version bump, verify the open tab shows the update notice, consent, and confirm the new version in About — the full 24.4 loop against production.
- [ ] **24.8.8** Subpath checks — verify `start_url`, scope, icons, and shortcuts resolve under the `/thundertv/` Pages subpath and that a standalone launch lands on `#/`.
- [ ] **24.8.9** Release integration — add the audit to the release protocol beside the §3 budget checks and the Phase 23 chaos checklist, cross-referenced from this phase file.
- [ ] **24.8.10** First execution — run the complete protocol for this phase's merge, triaging findings into fixes or accepted-risk notes recorded in the document.

## Feature 24.9 — SW kill-switch

A bad service worker deploy must never brick installed users: a prepared kill-switch build self-unregisters and purges caches through the normal update cycle, and a local reset gives an individual user the same escape hatch without waiting for a deploy.

- [ ] **24.9.1** Kill-switch worker — write `public/sw-killswitch.js`: on activate it deletes all caches, calls `self.registration.unregister()`, claims clients, and messages them to reload once.
- [ ] **24.9.2** No fetch handler — the kill-switch worker deliberately registers no fetch handler so it can never serve stale content while dismantling itself; a static test asserts the file contains none.
- [ ] **24.9.3** Deploy script — add `npm run deploy:killswitch` building `dist/` with the kill-switch worker in place of `sw.js`; the swap is exclusive, so both workers can never ship together.
- [ ] **24.9.4** Uncontrolled parity — assert the app runs identically with no controlling SW (it always must — the SW is an enhancement layer), which is exactly the post-kill-switch state.
- [ ] **24.9.5** Local reset — add a "Reset offline cache" action in About performing unregister + cache purge + reload locally, giving one user the fix without a deploy.
- [ ] **24.9.6** Recovery runbook — document the kill-switch procedure in `docs/pwa-audit.md`'s recovery section: when to deploy it, propagation timing (bounded by the 24.4.6 check cadence plus the browser's own SW update checks), and how to restore the normal worker afterwards.
- [ ] **24.9.7** No remote flags — record the decision that the normal `sw.js` consults no remote kill flags (offline-first purity); replacement-by-deploy is the only mechanism.
- [ ] **24.9.8** Local drill — serve `dist/` with the normal worker, swap in the kill-switch build, and verify unregistration, empty Cache Storage, and a working network-served app.
- [ ] **24.9.9** Clean re-install — after restoring the normal worker post-drill, verify a fresh registration precaches and controls the page under new versioned names.
- [ ] **24.9.10** Drill record — record the drill's observations (timing, per-browser behaviors) in the runbook so a real incident follows a rehearsed script.

## Feature 24.10 — PWA verification tests

The offline and update behaviors get pinned by automation: Playwright drives offline reloads and update simulations against built `dist/`, unit tests own the routing tables, and the suite lands in a dedicated npm script.

- [ ] **24.10.1** Offline reload smoke — Playwright: load built `dist/` from a local server, await SW control, `context.setOffline(true)`, reload, and assert the shell and a cached channel list render.
- [ ] **24.10.2** Update simulation — serve build v1, install, swap the served directory for v2 (different hash), trigger an update check, and assert `sw.updateReady`, the consent path, and the v2 marker after reload.
- [ ] **24.10.3** Cache-name migration — after the v2 activation, assert v1-prefixed shell/spektrum caches are deleted and only the current names remain.
- [ ] **24.10.4** Registration-guard units — with mocked environments, assert no registration attempt happens on the dev server, on `file://`, or when `serviceWorker` is absent.
- [ ] **24.10.5** Kill-switch automation — swap the kill-switch build into the Playwright harness and assert unregistration plus empty Cache Storage while the app still boots from network.
- [ ] **24.10.6** Offline plus partial tier — combined scenario: block IndexedDB (probe fails) and go offline; assert favorites/recent render from localStorage snapshots under the cached shell.
- [ ] **24.10.7** Media non-interference — play a fixture stream under SW control and assert segment requests hit the network (request-interception counts) with zero new cache entries afterwards.
- [ ] **24.10.8** Routing-table extension — extend the 24.6.8 unit tables with navigation-fallback and non-GET cases so the helper's full decision surface is pinned.
- [ ] **24.10.9** Suite wiring — expose the Playwright suite as `npm run test:pwa`, document it in `package.json` and this phase's verification, and keep it out of the default unit run for speed.
- [ ] **24.10.10** Phase bookkeeping — check every box, record the decisions (consent-only skipWaiting, no remote kill flags, deny-by-default routing), and run the standing MASTERPLAN.md §3 checklist plus the first 24.8 audit.
