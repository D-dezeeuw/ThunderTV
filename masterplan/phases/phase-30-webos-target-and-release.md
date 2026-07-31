# Phase 30 — webOS Target & 1.0 Release

> **Epic goal:** The same app runs on an LG TV as a packaged webOS web app, the documentation set is complete, security and privacy are audited end to end, and version 1.0 is tagged, deployed, and released with all artifacts attached.
> **Verification:** `npm run package:webos` produces an `.ipk` that installs via `ares-install` and passes the full pointer-free remote journey on real webOS hardware; the security-audit report exists with zero unaccepted criticals; the `v1.0.0` tag, GitHub release with desktop + TV artifacts and `SHA256SUMS`, gh-pages deploy, and reconciled masterplan checkboxes all exist.
> **Status:** `partial` · tracker: `not-maintained` — Packaging works end to end: `npm run build:lg` runs `vite build --mode webos`, the import-map swap, `es-module-shims` injection and `package-webos.mjs`'s `ares-package`. Phase 35 since gave the TV target the input model this phase assumed and 25 never built. **Not done:** on-device validation (30.3–30.6), the 1.0 documentation set, the landing page, the final security audit and the v1.0 tag.

Before this phase ThunderTV ships on web and desktop (Phases 01–29) and the TV story is a design promise: keyboard-first UI (Phase 25), tiered storage with a real boot probe, `base: './'`, and the vendored-Spektrum swap all built for this moment. After this phase the swapped `dist/` runs as a packaged webOS app validated on real hardware — storage tier, remote navigation, MSE/hls.js playback, and TV performance all measured — the 1.0 documentation set and landing page are live, a final security and privacy audit is on record, and v1.0.0 is released the project's way: local builds, manual upload, no GitHub Actions anywhere.

## Feature 30.1 — webOS packaging

The web app becomes an LG TV app: a `webos/appinfo.json`, an ares-cli packaging chain over the swapped `dist/`, and an installable `.ipk` proven on emulator and real hardware.

- [ ] **30.1.1** Create `webos/appinfo.json` — id, three-part numeric version, vendor, `type: "web"`, `main: "index.html"`, title, icon references, and `resolution: "1920x1080"` per LG's required fields.
- [ ] **30.1.2** TV icon assets — the 80×80 icon and 130×130 large icon derived from the master icon via `scripts/gen-icons.mjs` into `webos/`.
- [ ] **30.1.3** Packaging chain — `npm run package:webos` runs `vite build` → `node scripts/package-target.mjs webos` → assemble a staging dir (`dist/` + `appinfo.json` + icons) → `ares-package` emitting the `.ipk` into `release/`.
- [ ] **30.1.4** ares-cli setup doc — `webos/README.md` covers installing the ares CLI tools, enabling TV Developer Mode, and `ares-setup-device` against the TV.
- [ ] **30.1.5** Install and launch — `ares-install --device tv` then `ares-launch`, confirmed first on the emulator, then on real hardware.
- [ ] **30.1.6** Remote debugging — `ares-inspect --device tv --app <id> --open` documented as the on-device devtools path; record the Chromium version each test TV reports.
- [ ] **30.1.7** Version-sync check — `package:webos` fails when the digits-only appinfo version has drifted from the `package.json` semver.
- [ ] **30.1.8** Artifact discipline — the `.ipk` follows the naming scheme (`thundertv-<version>-webos.ipk`) and joins `SHA256SUMS`.
- [ ] **30.1.9** Lifecycle behavior — verify relaunch/resume semantics (webOS keeps apps warm) and that `visibilitychange` pauses or continues playback sensibly; the chosen behavior noted as a decision.
- [ ] **30.1.10** Sideload doc — end-user Developer Mode install instructions, including the dev-mode expiry timer caveat, written for the Feature 30.7 docs set.

## Feature 30.2 — Import-map compatibility for TV

Older webOS Chromium predates import-map support (Chromium 89), so the TV package always uses the vendored Spektrum path and conditionally carries `es-module-shims` — injected only into the webOS build, never web or Electron.

- [ ] **30.2.1** Map the target engines — record webOS-version → Chromium-version for every available test device and emulator image, establishing which need the shim.
- [ ] **30.2.2** webOS swap strategy — `package-target.mjs webos` always rewrites to the vendored `./vendor/spektrum.min.js` (network-independent) and injects the shim script.
- [ ] **30.2.3** Vendor the shim — a pinned `es-module-shims` copy (~9 KB) in `public/vendor/`, referenced only by the webOS-swapped HTML.
- [ ] **30.2.4** Injection order — the shim `<script async>` placed before the import map per its documentation, verified working on an old-engine emulator image.
- [ ] **30.2.5** Runtime path telemetry — an inline `HTMLScriptElement.supports?.('importmap')` check records whether native or shim resolution activated, surfaced in the diagnostics export for TV bug reports.
- [ ] **30.2.6** Worker format check — verify the Vite worker chunks execute on old TV Chromium; switch the webOS build's workers to classic/iife format if module workers are missing, decision recorded.
- [ ] **30.2.7** Syntax floor — set the webOS build's `build.target` to the oldest measured TV Chromium so no modern-syntax parse error can crash boot; web and Electron keep the evergreen target.
- [ ] **30.2.8** CSS floor spot-check — verify the used CSS features (custom properties, `content-visibility`, flex gap) on the TV engine and add fallbacks only where actually broken.
- [ ] **30.2.9** Emulator matrix — run the swapped build on the oldest and newest available webOS emulator images and record pass/fail per feature.
- [ ] **30.2.10** Cross-target regression guard — the swap-verification specs assert the webOS HTML contains shim + vendored map while the Electron output has neither shim nor CDN and the web build keeps the pinned CDN.

## Feature 30.3 — TV storage probe validation

The tiered-storage design was built for exactly this hardware: validate that the boot probe classifies real webOS correctly, that partial/none degradation is livable and clearly messaged, and that TV quotas and eviction behave as designed.

- [ ] **30.3.1** On-device probe run — boot on real webOS, read the probed tier from the diagnostics surface, and record it per device and firmware in this phase file.
- [ ] **30.3.2** Probe timeout — add a bounded timeout to `probeIndexedDb` so a TV engine whose `open()` hangs demotes to the next tier instead of stalling boot; regression spec included.
- [ ] **30.3.3** Partial-tier journey — force the localStorage tier on the TV: sources re-fetch on boot with visible progress while favorites render instantly from denormalized snapshots; the one-line notice verified readable at 10-foot distance.
- [ ] **30.3.4** None-tier journey — force both probes to fail: a fully functional in-memory session with the storage notice, and a connect-URL re-import working every boot as the tier-none TV story.
- [ ] **30.3.5** Quota reality check — fill-test IDB and localStorage on device to measure actual TV quotas, and confirm `guardedSet` demotes gracefully at the real limits instead of crashing.
- [ ] **30.3.6** Standby persistence — verify stored data survives TV standby and full power-off cycles; measure whether webOS ever evicts app storage and document the finding.
- [ ] **30.3.7** Eviction recovery — if eviction occurs, the next boot must re-probe, re-parse sources, and explain once — not nag; verified by clearing app data manually.
- [ ] **30.3.8** Snapshot budget audit — confirm the capped favorites and recent snapshots (recent ≤ 100) fit comfortably within the measured TV localStorage budget on the partial tier.
- [ ] **30.3.9** Probe reasons in diagnostics — tier plus redacted probe-failure reasons included in the diagnostics export so TV reports are actionable.
- [ ] **30.3.10** User-facing doc — a "storage on TVs" subsection in the troubleshooting guide summarizing per-tier behavior in plain words.

## Feature 30.4 — Remote navigation validation

The Phase 25 keyboard-first UI is the remote-control story; this feature proves it on the couch — the complete journey from provisioning through browsing, playback, and settings without a pointer ever appearing.

- [ ] **30.4.1** Key-code mapping — map webOS remote codes (OK, arrows, Back = 461, media keys) onto the Phase 25 keyboard map in a small `src/ui/input/webos-keys.ts`, only where codes differ from desktop.
- [ ] **30.4.2** Back-button semantics — define and implement the Back stack order (close panel → exit theater → stop dock → platform back), aligned with LG guidelines; decision noted.
- [ ] **30.4.3** Journey script — document the full pointer-free run: cold boot → provision a source → arrow-browse → OK plays → dock/theater toggle → settings panel → favorite a channel.
- [ ] **30.4.4** Connect provisioning on TV — validate both paths: the TV-browser web app opened with a connect bookmark fragment, and the packaged app's manual connect-link entry, confirming scrub and `save=0` semantics on both.
- [ ] **30.4.5** Focus visibility at 3 m — the roving-focus ring must be clearly visible on a 1080p panel from the couch; adjust the `tokens.css` focus token if washed out, with instant (non-animated) moves.
- [ ] **30.4.6** Focus-trap sweep — arrow-only navigation through every view (settings panel, group filter, EPG inline detail, player dock) hunting unreachable or looping focus; fix all traps.
- [ ] **30.4.7** Long-list navigation — held-arrow repeat over the 90 k list stays smooth under the windowing controller, and channel-up/down remote keys map to page jumps.
- [ ] **30.4.8** Player-mode keys — during playback: ←/→ zaps, media play/pause works, Back exits theater, and no key event leaks through to scroll the underlying list.
- [ ] **30.4.9** IME interplay — the webOS on-screen keyboard feeding search and connect entry works with the `data-model` bindings, including committed vs composing text.
- [ ] **30.4.10** Journey sign-off — record the full journey result per device; blockers fixed, cosmetics noted; a green re-run is this feature's exit criterion.

## Feature 30.5 — MSE/hls.js validation on device

TV media stacks are where streams that worked everywhere else go to die: the Phase 11 stream matrix re-runs on real webOS hardware, engine choices get TV-specific tuning, and every finding lands in the docs.

- [ ] **30.5.1** Port the matrix — the Phase 11 stream matrix (live/VOD HLS, TS vs fMP4 segments, H.264/AAC/AC-3, raw `.ts`, plain MP4) tabulated in `docs/qa-webos.md` for device runs.
- [ ] **30.5.2** MSE capability survey — record `MediaSource.isTypeSupported` results for the matrix codecs per TV and firmware as reference data.
- [ ] **30.5.3** hls.js on TV — run the HLS set through hls.js on device and tune conservative TV overrides (worker use, buffer lengths for TV memory) confined to the player config module.
- [ ] **30.5.4** Native-HLS decision — measure whether webOS native video handles HLS well enough to beat hls.js there; encode the per-target choice in `selectEngine` with the decision noted.
- [ ] **30.5.5** mpegts.js on TV — validate raw `.ts` live streams and measure CPU headroom; wire the stall-detection messaging for devices that cannot sustain it.
- [ ] **30.5.6** AC-3/E-AC-3 audio — validate the common IPTV audio codecs per device and document the support table, a top real-world TV complaint.
- [ ] **30.5.7** Recovery on device — exercise hls.js media-error recovery and network retry (Phases 11/23) by killing the mock stream mid-play on the TV.
- [ ] **30.5.8** Zap soak — zap 20 channels on device while watching memory via `ares-inspect`, confirming the destroy-before-create invariant (§5.3) holds and recording zap latency for Feature 30.6.
- [ ] **30.5.9** Mixed-content contrast — confirm the packaged app plays `http://` streams while the TV-browser web variant shows the mixed-content explanation, proving capability messaging is right on both paths.
- [ ] **30.5.10** Findings doc — complete the matrix with pass/fail/notes per device and firmware, and fold the conclusions into the troubleshooting guide.

## Feature 30.6 — TV performance pass

The Phase 26 measurement machinery goes to the living room: boot, import, scroll, zap, and search measured on real TV silicon at 1080p, judged against the throttled budget class and logged for posterity.

- [ ] **30.6.1** Boot spans on TV — read the Phase 26 `performance.mark` spans via `ares-inspect` for cold and warm starts with the cached fixture, compared against the throttled budgets.
- [ ] **30.6.2** Import on TV — 100 k fixture import wall-clock on device, recorded against the 5 s desktop budget with a TV-accepted number added under `budgets.json`'s throttled/TV key.
- [ ] **30.6.3** Scroll protocol on device — the 26.5 run driven by held remote arrows, with long tasks and the ≤ ~40 DOM-row cap verified through remote devtools.
- [ ] **30.6.4** Zap latency — key-press→first-frame across 10 zaps per engine; p50/p95 recorded and a TV target set (with the number noted as a decision).
- [ ] **30.6.5** Search on TV — on-device p95 keystroke latency including IME entry, confirming the 150 ms debounce absorbs IME jank.
- [ ] **30.6.6** Playback soak — a one-hour playback session watching heap and process memory (webOS kills hungry apps); no growth trend allowed, observed ceiling documented.
- [ ] **30.6.7** 1080p canvas check — verify layout and density defaults read well at 1920×1080 from 3 m, and that `devicePixelRatio` handling doesn't inflate DOM work.
- [ ] **30.6.8** Repaint sanity — paint-flashing via remote devtools confirms the 30 s tick repaints only rows whose now/next actually changed, on TV as on desktop.
- [ ] **30.6.9** Perf-log entries — every TV number lands in `masterplan/perf-log.md` tagged with device model and firmware version.
- [ ] **30.6.10** Budget verdict — an explicit pass/fail table against each §3 budget with TV-adjusted targets; failures triaged into fix-now vs documented limitation.

## Feature 30.7 — 1.0 documentation set

Everything a user or contributor needs, finished and verified: complete README, an illustrated user guide, the connect-URL guide with its honest security wording, and troubleshooting that covers the web's real limits.

- [ ] **30.7.1** README final pass — complete top to bottom: what it is, screenshots, web quickstart, desktop install, TV sideload, development, verify/test, deploy — every command re-run verbatim.
- [ ] **30.7.2** User guide — `docs/guide.md` covering import flows (file/paste/URL/Xtream), favorites and recent, EPG usage, search, the keyboard map, and a settings reference, with current dark-theme screenshots.
- [ ] **30.7.3** Connect-URL guide — `docs/connect-urls.md`: the fragment format, the per-source link generator, `save=0`, and the §7 security posture in plain words (fragment-only, scrubbed address bar, bookmark-sync tradeoff).
- [ ] **30.7.4** Troubleshooting — `docs/troubleshooting.md`: CORS on the web (why URL imports fail, the alternatives, the proxy setting), mixed content, TV storage tiers, unsigned installs, per-engine playback failures, and the diagnostics export.
- [ ] **30.7.5** Screenshot pipeline — `scripts/screenshots.mjs` produces consistent fixture-based screenshots via Playwright, so no real provider data or credentials can ever appear in docs.
- [ ] **30.7.6** Keyboard/remote reference — one canonical keys-to-remote-buttons table, with a doc-drift spec asserting it matches the Phase 25 keymap module.
- [ ] **30.7.7** FAQ — short honest answers: no telemetry, no bundled content or playlists (player only), why unsigned, why no auto-update, webOS dev-mode expiry.
- [ ] **30.7.8** Link integrity — README ↔ guide ↔ troubleshooting ↔ `PRIVACY.md` ↔ landing page cross-links verified by a link-check script pass.
- [ ] **30.7.9** Strings alignment — user-facing wording in docs matched against the central strings module (error names, notice texts) so guidance mirrors the actual UI.
- [ ] **30.7.10** Rendered review — a full read-through of every doc as rendered on GitHub and Pages, formatting fixed, completion noted in this phase file.

## Feature 30.8 — Landing page on Pages

A minimal hand-written static page — no build framework, no JS-heavy anything — that says what ThunderTV is, launches the web app, links the desktop downloads, and points TVs at their instructions.

- [ ] **30.8.1** Placement decision — the app keeps the Pages root (connect URLs unchanged); the landing ships from `public/welcome/` as `/welcome/`, with the decision and rationale noted.
- [ ] **30.8.2** Hand-written page — one `index.html` and one CSS file under `public/welcome/`, system font stack, dark theme with copied token values, no build step, no framework, and — like the app — no CSS transitions or animations.
- [ ] **30.8.3** Content — what it is in three sentences, a launch button into the web app, per-OS download links, a TV-instructions link, and the GitHub link.
- [ ] **30.8.4** Evergreen download links — point at the GitHub releases latest page rather than versioned asset URLs so the landing never goes stale between releases.
- [ ] **30.8.5** Hero screenshot — one optimized image from the Feature 30.7 pipeline (≤ ~100 KB) with explicit width/height so nothing shifts on load.
- [ ] **30.8.6** App → landing link — the app's About/footer links to `/welcome/` with a relative URL that works on the Pages subpath.
- [ ] **30.8.7** Weight budget — the whole landing including the image transfers in ≤ ~150 KB, verified with a devtools pass; performance is the brand even here.
- [ ] **30.8.8** Meta basics — title, description, and og tags, favicon reused from the icon set, and zero analytics with the posture restated in an HTML comment.
- [ ] **30.8.9** Accessibility pass — semantic landmarks, alt text, and a contrast check on the dark palette.
- [ ] **30.8.10** Deploy check — `npm run deploy` publishes the landing with the app; verify the live URL renders, all links resolve, and any connect-URL example on the page carries only `example.invalid` credentials.

## Feature 30.9 — Final security and privacy audit

Before 1.0, the credential path is traced end to end — fragment → scrub → storage → logs → export — the no-telemetry claim is verified against every network call site, and the dependency surface is audited and recorded.

- [ ] **30.9.1** Entry trace — audit every credential entry point (connect fragment, settings forms, Xtream import) confirming nothing ever writes credentials into a query string or visible URL.
- [ ] **30.9.2** Scrub trace — prove `history.replaceState` scrubs before any subsequent network request, using the mock server's request-order log, on web, `file://`, and TV.
- [ ] **30.9.3** Storage trace — inspect at-rest shapes on every tier: credentials only inside the sources store, and `save=0` keeping them memory-only for the session, verified via devtools storage inspection.
- [ ] **30.9.4** Log trace — a hostile-fixture spec sweep proving the redactor masks Xtream path-embedded credentials (§6.8), connect fragments, and auth-style headers at every logger entry point.
- [ ] **30.9.5** Export trace — the diagnostics export re-audited after the TV additions: the default export carries zero URLs and usernames, opt-in fields clearly labeled.
- [ ] **30.9.6** No-telemetry sweep — enumerate every network call site (tractable because the lint fences confine them to `src/core/http` and the Electron main HTTP), confirm each is user-initiated, and publish the inventory in `PRIVACY.md`.
- [ ] **30.9.7** Dependency audit — `npm audit` plus a manual review of the tiny production dependency set, and the vendored `spektrum.min.js` / `es-module-shims` hashes re-verified against their upstream releases.
- [ ] **30.9.8** Electron surface re-check — re-run the Phase 28.8 security checklist against the actual packaged 1.0 candidate artifact, not the source tree.
- [ ] **30.9.9** Supply-chain notes — lockfile committed, `npm ci` documented as the canonical install, and the dependency tree confirmed free of postinstall scripts (exceptions noted).
- [ ] **30.9.10** Audit report — findings and resolutions written to `docs/security-audit-1.0.md`; every open item fixed or explicitly accepted with rationale — the release blocks on unaccepted criticals.

## Feature 30.10 — Version 1.0 release

The final loop of the masterplan's way of working, executed for real: verify green, budgets reconciled, checkboxes true, tag pushed, web deployed, artifacts attached — all from a local machine, no Actions anywhere.

- [ ] **30.10.1** Preflight — full `npm run verify` plus web and Electron E2E green on the release commit; the `verify-report.json` archived alongside the release notes.
- [ ] **30.10.2** Budget reconciliation — `check-budgets` (bundles and artifacts) green and fresh `masterplan/perf-log.md` entries present for 1.0; the §3 budgets confirmed one final time.
- [ ] **30.10.3** Masterplan reconciliation — sweep all 30 phase files: every checkbox accurate, decision notes in place, stale claims corrected — the masterplan itself ships true.
- [ ] **30.10.4** Changelog 1.0 — collapse Unreleased into a curated `1.0.0` section: headline features and known limitations (web CORS, unsigned builds, webOS dev-mode installs).
- [ ] **30.10.5** Bump and tag — `scripts/release.mjs` bumps to 1.0.0, tags `v1.0.0` on the verified commit, and pushes `main` plus the tag.
- [ ] **30.10.6** Build all artifacts — Windows portable + NSIS, macOS DMG, Linux AppImage, and the webOS `.ipk`, all from the tag, with `SHA256SUMS` regenerated over the full set.
- [ ] **30.10.7** GitHub release — create `v1.0.0` manually (`gh release create` or the web UI), attach artifacts and checksums, paste the changelog; no CI touches any of it.
- [ ] **30.10.8** Deploy the web — `npm run deploy` publishes the 1.0 app and landing to gh-pages, followed by a live smoke on the Pages URL: import, play, connect URL, session restore.
- [ ] **30.10.9** Post-release QA — download and install each artifact from the release page (not local builds), run a quick Feature 29.8 pass per OS, and sideload the released `.ipk` on the TV.
- [ ] **30.10.10** Close the loop — point README badges and links at v1.0.0, mark the masterplan complete, and append a short retrospective with the post-1.0 backlog to the masterplan.
