# Phase 26 — Performance Hardening

> **Epic goal:** Turn the §3 performance budgets from prose into measured, enforced numbers — deterministic stress fixtures, runnable local scripts, and a logged regression protocol that every later phase and release re-runs.
> **Verification:** `node scripts/check-budgets.mjs` passes against a fresh `vite build`; the scripted measurement runs against the 100 k fixture show cold start < 1 s (cached, full tier), import < 5 s, scroll with zero >50 ms long tasks and ≤ ~40 DOM rows, and search p95 < 50 ms; all baselines are recorded in `masterplan/perf-log.md`.
> **Status:** `partial` · tracker: `not-maintained` — The budgets are codified **and enforced**: `scripts/check-dist.mjs` fails `npm run verify` at 200 kB raw / 60 kB gz on the entry chunk, and `gen-m3u-fixture.mjs` plus `parser.bench.ts` and `virtual-list.bench.ts` cover the stress fixture, parse throughput and scroll work. **Not built:** startup instrumentation (26.3 — there is no `performance.mark` anywhere in `src/`), the memory profiling pass (26.4) and low-end device validation (26.10).

Before this phase the app is feature-complete for the web target (Phases 01–25), but the performance budgets exist only as a manually-checked list in MASTERPLAN.md §3 and the standing checklist. After this phase every budget has a deterministic fixture, a local script that measures it and fails red on regression, a tuned set of worker/storage constants backed by sweep data, and a committed perf log that becomes the per-release tracking document — all pure local tooling, no CI.

## Feature 26.1 — Budgets codified

The bundle-size budgets become an executable gate: a script reads the real Vite build output and fails the build when any threshold is exceeded, so a budget breach can never merge silently.

- [ ] **26.1.1** Create `scripts/check-budgets.mjs` — walk `dist/assets/` after `vite build`, gzip every emitted chunk with `node:zlib`, and print a per-chunk size table.
- [ ] **26.1.2** Add `budgets.json` at the repo root — named thresholds (`initialAppGz: 60000`, `spektrumGz: 6500`, per-lazy-chunk caps for the hls.js and mpegts.js engine chunks) so every budget change is a reviewable diff.
- [ ] **26.1.3** Classify initial vs lazy chunks — enable `build.manifest` in `vite.config.ts` and resolve the entry graph so only chunks loaded before first interaction count against the ~60 KB initial budget.
- [ ] **26.1.4** Fail over threshold — exit code 1 listing offending chunk names and byte deltas; a warn band at 90 % of a threshold prints without failing.
- [ ] **26.1.5** Assert Spektrum stays external — scan built chunks for Spektrum's exported symbols and fail if any bundle inlines the library past the import map.
- [ ] **26.1.6** Guard the vendored copy — verify `public/vendor/spektrum.min.js` matches the pinned CDN version byte-for-byte so packaged targets get the same ~6 KB gz payload.
- [ ] **26.1.7** DOM-row budget hook — export the window+overscan constants from the `src/ui/` virtual-list config and have the script fail if the configured maximum visible row count can exceed ~40.
- [ ] **26.1.8** Wire `npm run check-budgets` — a package.json script chained after `vite build`, runnable standalone and from the future verify gate.
- [ ] **26.1.9** Unit-test the classifier — a Vitest spec feeds a fixture Vite manifest and asserts initial/lazy attribution and threshold math.
- [ ] **26.1.10** Document the gate — a README development-section entry stating that raising any number in `budgets.json` requires a written rationale in the same commit.

## Feature 26.2 — 100k-channel stress fixture generator

Every performance claim needs the same reproducible input: a deterministic synthetic generator produces the 100 k-channel M3U and matching XMLTV used by all measurement scripts, so numbers are comparable across machines and months.

- [ ] **26.2.1** Create `scripts/gen-fixtures.mjs` — a seeded PRNG (mulberry32, fixed seed) so every run emits byte-identical fixtures.
- [ ] **26.2.2** Synthetic M3U writer — emit 100 000 `#EXTINF` rows with realistic `tvg-id`, `tvg-logo`, and `group-title` spread (~500 groups, skewed distribution) and mixed `.m3u8`/`.ts`/`.mp4` URLs.
- [ ] **26.2.3** Malformed-row sprinkle — inject a fixed percentage of real-world defects (BOM, CRLF, missing commas, duplicate tvg-ids) mirroring what the patched `iptv-playlist-parser` fork tolerates.
- [ ] **26.2.4** Edge-attribute coverage — include catchup and `tvg-shift` attributed rows so the ported `catchup.utils` and m3u-utils paths are exercised at scale.
- [ ] **26.2.5** Synthetic XMLTV writer — a 3-day programme horizon for a 20 k-channel subset (~36 programmes each), with a `.gz` variant emitted alongside for the gzip import path.
- [ ] **26.2.6** Size tiers — `--channels 1000|10000|100000` flags emit small/medium/large fixtures; the large tier stays out of git and is regenerated on demand.
- [ ] **26.2.7** Manifest with checksums — write a `manifest.json` next to the fixtures with SHA-256 per file so generator drift is detected immediately.
- [ ] **26.2.8** Emit the small tier into `test/fixtures/generated/` — noting that Phase 27 curates the committed fixture library around it.
- [ ] **26.2.9** Timing output — the generator prints generation wall-clock and row/programme counts for sanity checking.
- [ ] **26.2.10** Spec the determinism — a Vitest spec asserts the fixed-seed output's prefix hash stays stable across runs.

## Feature 26.3 — Startup instrumentation

Cold start < 1 s only means something if the boot path is measured span by span; `performance.mark`/`measure` instrumentation plus a dev overlay makes boot time visible during development and scriptable for regression checks.

- [ ] **26.3.1** Define the span taxonomy — mark names `boot:start`, `storage:probe`, `state:rehydrate`, `dom:first-window`, `app:interactive` in a small `src/core/perf/marks.ts` module.
- [ ] **26.3.2** Instrument the boot order in `src/main.ts` — `performance.mark` calls around `createStorage()`, the `getMany` rehydrate, the Spektrum bind, and the first `publishWindow()`.
- [ ] **26.3.3** Aggregate with `performance.measure` — `src/core/perf/report.ts` computes named spans between marks and exposes one structured boot report object.
- [ ] **26.3.4** Pin the "interactive" definition — mark `app:interactive` when the first channel window is published and input handlers are attached, the moment the < 1 s budget is judged against.
- [ ] **26.3.5** Dev overlay readout — a fixed-position plain-text panel bound via Spektrum showing the span table, toggled by a `perf` hash flag; instant show/hide, no CSS transitions.
- [ ] **26.3.6** Zero prod cost — load the overlay via dynamic `import()` behind the flag so the production initial bundle is unaffected (confirmed by `check-budgets`).
- [ ] **26.3.7** Persist recent boots — store the last few boot span sets through the storage adapter (tiny JSON, safe on the partial tier) so the overlay can show a trend.
- [ ] **26.3.8** Scripted measurement — `scripts/measure-boot.mjs` uses Playwright against `vite preview`: import the 100 k fixture, reload, and read `performance.getEntriesByType('measure')` for the cached cold-start numbers.
- [ ] **26.3.9** Record baselines — cold and warm boot spans for the 100 k fixture logged to `masterplan/perf-log.md`.
- [ ] **26.3.10** Regression assertion — `measure-boot.mjs` exits non-zero when `app:interactive` exceeds 1000 ms on the cached full-tier run.

## Feature 26.4 — Memory profiling pass

Zapping is the app's core gesture, and every player engine holds a MediaSource, XHRs, and timers (§5.3) — a scripted 100-channel zap protocol with a heap-stable assertion hunts leaks before users find them.

- [ ] **26.4.1** Write the zap-100 protocol — a documented sequence playing/zapping through 100 fixture channels (hls/mpegts/native mix) via the ←/→ zap keys.
- [ ] **26.4.2** Automate it — `scripts/measure-memory.mjs` drives the sequence with Playwright and samples heap via CDP `Performance.getMetrics`.
- [ ] **26.4.3** Heap-stable assertion — after zap-100 plus forced GC (`HeapProfiler.collectGarbage`), the JS heap must return to within ~10 % of the post-boot baseline or the script exits non-zero.
- [ ] **26.4.4** Engine singleton audit — instrument `player/engine-host` with a dev-only live-instance counter and assert it never exceeds 1 (the destroy-before-create invariant).
- [ ] **26.4.5** MediaSource release check — verify `removeAttribute('src')` + `load()` runs between zaps by counting live MediaSource objects via CDP `queryObjects` after the run.
- [ ] **26.4.6** Listener sweep — compare event-listener counts on the video element and `window` before and after zap-100; any growth is a failure.
- [ ] **26.4.7** Detached-DOM check — take a heap snapshot after a long scroll+zap session and assert zero detached channel-row nodes.
- [ ] **26.4.8** Timer audit — patch `setInterval` in dev to a registry and assert only the single global 30 s tick survives the session (no per-row timers, ever).
- [ ] **26.4.9** Fix what the hunt finds — land each leak fix with a regression note in this phase file per the autonomy rule.
- [ ] **26.4.10** Log results — heap curves and final numbers appended to `masterplan/perf-log.md`.

## Feature 26.5 — Scroll frame-time validation

"No dropped frames over 90 k rows" becomes a scripted run: long-task observation and DOM-row sampling while a driver scrolls the full fixture, failing red when the windowing controller regresses.

- [ ] **26.5.1** Scripted scroll driver — `scripts/measure-scroll.mjs` scrolls the 90 k list top→bottom in wheel steps at several velocities via Playwright.
- [ ] **26.5.2** Long-task observation — inject a `PerformanceObserver({ type: 'longtask' })` before scrolling and collect every entry > 50 ms.
- [ ] **26.5.3** Frame-delta sampling — a `requestAnimationFrame` delta recorder computes dropped-frame percentage per velocity pass.
- [ ] **26.5.4** DOM-row assertion — sample the `data-each` container's child count throughout the run and assert ≤ ~40 rows at every sample point.
- [ ] **26.5.5** rAF-throttle verification — a counter on the `publishWindow` scheduling path (§6.1) asserts at most one publish per animation frame.
- [ ] **26.5.6** Spacer-math check — at random scroll offsets, `padTop + rows + padBottom` must equal `rowCount × ROW_H` in both density modes (32 px and 44 px).
- [ ] **26.5.7** Lazy-logo pressure — a pass with logo URLs enabled confirms `loading="lazy"` images in fixed-size boxes cause neither layout shift nor long tasks.
- [ ] **26.5.8** Group-view pass — repeat the protocol on the groups view so chunked group loading is covered, not just the flat list.
- [ ] **26.5.9** Thresholds and exit codes — fail on any scroll-attributable long task > 50 ms or > 1 % dropped frames.
- [ ] **26.5.10** Record baselines — per-velocity results with machine/CPU notes appended to `masterplan/perf-log.md`.

## Feature 26.6 — Search latency validation

The < 50 ms search budget is measured per keystroke with a scripted typing sequence over the 90 k fixture, isolating filter work from the intentional 150 ms debounce and proving the incremental-filter optimization actually engages.

- [ ] **26.6.1** Keystroke script — `scripts/measure-search.mjs` types a scripted sequence (query grows char by char, backspaces, then a pasted full term) into the search box against the 90 k fixture.
- [ ] **26.6.2** Instrument the search path — `performance.mark` pairs around debounce-fire → filter → `setValue('list.visibleRows')` measuring pure filter-to-publish time.
- [ ] **26.6.3** p95 assertion — collect ≥ 100 measured keystrokes, compute p50/p95, and fail when p95 ≥ 50 ms (debounce delay excluded by construction).
- [ ] **26.6.4** Incremental-filter verification — a dev-only scanned-row counter proves growing queries filter the previous result set, not the full array.
- [ ] **26.6.5** Normalization precompute — confirm case/diacritics normalization happens once per channel at parse time, not per keystroke; move it to the parser if profiling says otherwise.
- [ ] **26.6.6** Combined-filter pass — rerun the sequence with a group filter active to cover the search+group intersection path.
- [ ] **26.6.7** Worst-case queries — include zero-hit and all-hit queries in the script; both must stay inside the budget.
- [ ] **26.6.8** Empty-query restore — clearing the search must republish the full window in < 50 ms without a re-filter of 90 k rows.
- [ ] **26.6.9** Micro-bench canary — a `vitest bench` for the pure filter function over 90 k in-memory rows as a fast local early-warning.
- [ ] **26.6.10** Log p50/p95 per scenario to `masterplan/perf-log.md`.

## Feature 26.7 — Worker parse throughput tuning

The 100 k-import-under-5 s budget lives or dies in the parser worker and its chunked protocol (§5.10); a measured chunk-size sweep replaces guessed constants with numbers.

- [ ] **26.7.1** Bench harness — `scripts/bench-parse.mjs` runs the M3U parser worker against the 100 k fixture repeatedly and reports p50 wall-clock.
- [ ] **26.7.2** Chunk-size sweep — parameterize `CHUNK` (1 k / 2 k / 5 k / 10 k), record parse+deliver totals, and commit the winner as the default in `src/m3u/worker-protocol.ts` with the sweep numbers in a comment.
- [ ] **26.7.3** Transferable evaluation — measure structured-clone chunks vs an encoded `ArrayBuffer` transferable path; adopt transferables only where the numbers clearly win, and note the decision.
- [ ] **26.7.4** Progress cadence — throttle `progress` messages to ≥ 100 ms intervals so reporting itself never taxes the main thread.
- [ ] **26.7.5** Receive-cost cap — measure the main-thread per-chunk handler and keep it under ~8 ms per message so the UI stays responsive mid-import.
- [ ] **26.7.6** XMLTV worker pass — the same sweep for the EPG worker with the 3-day fixture, covering both plain XML and the `.gz` path through `DecompressionStream`.
- [ ] **26.7.7** Regression assertion — the bench exits non-zero when 100 k parse+persist exceeds 5 s on the reference machine.
- [ ] **26.7.8** Long-task check during import — a `PerformanceObserver` run during a UI-driven import confirms the main thread never blocks > 50 ms.
- [ ] **26.7.9** Raw-text discard audit — assert the worker retains no raw playlist text after the `summary` message (the parse-once caching rule).
- [ ] **26.7.10** Record tuned constants and sweep tables in `masterplan/perf-log.md` and this phase file's decision notes.

## Feature 26.8 — Storage write batching tuning

Import wall-clock is parse plus persist; a bulk-put batch-size sweep per storage tier finds the sweet spot between transaction overhead and main-thread stalls, and validates the demotion guards under real pressure.

- [ ] **26.8.1** Bench IDB bulk put — `scripts/bench-storage.mjs` times chunked `put` batches (1 k / 2.5 k / 5 k / 10 k rows per transaction) into the `channels` store through the `idb` wrapper.
- [ ] **26.8.2** Transaction shape — compare one-transaction-per-chunk vs one long transaction; prefer per-chunk for resilience unless numbers strongly disagree, and note the decision.
- [ ] **26.8.3** End-to-end attribution — the 100 k import report splits time between worker parse and storage persist so regressions are attributable.
- [ ] **26.8.4** Partial-tier budget — measure chunked-JSON localStorage writes for the small-data set (settings, sources, favorites, recent) and confirm comfortable headroom inside the ~5 MB budget.
- [ ] **26.8.5** Quota-demotion drill — simulate `QuotaExceededError` mid-batch and assert the `guardedSet` path (§5.7) demotes to the memory tier without corrupting the in-session data.
- [ ] **26.8.6** Memory-tier cost — confirm none-tier writes are near-zero so import wall-clock on that tier pays only for parsing.
- [ ] **26.8.7** Backpressure evaluation — measure whether awaiting batch completion before consuming the next worker chunk is needed on slow disks; add a bounded queue only if buffering is observed.
- [ ] **26.8.8** Read-back verification — after a tuned import, `count` the rows and checksum a sample against the fixture manifest.
- [ ] **26.8.9** Boot read path — measure `getMany` plus the channel load into the in-memory query array on cold start and confirm it fits inside the < 1 s interactive budget alongside the 26.3 spans.
- [ ] **26.8.10** Commit tuned batch sizes as named constants in `src/core/storage/` with sweep results in comments and a perf-log entry.

## Feature 26.9 — Bundle size tracking

Budgets stop regressions; tracking shows drift. A per-chunk gzip report is appended to `masterplan/perf-log.md` at every release so size history is a reviewable document, not tribal memory.

- [ ] **26.9.1** Create `masterplan/perf-log.md` — a header documenting cadence: one dated entry per release or phase merge, with commit hash and the number tables.
- [ ] **26.9.2** Report generator — a `--report` mode on `scripts/check-budgets.mjs` emits the per-chunk gzip table as a ready-to-append markdown block.
- [ ] **26.9.3** Auto-append mode — `npm run perf:log` runs build + report and appends a dated section to the log file.
- [ ] **26.9.4** Track lazy chunks separately — hls.js engine, mpegts.js engine, and any worker chunks listed with their own lines so lazy growth is visible independently of the initial budget.
- [ ] **26.9.5** Delta highlighting — the report shows +/- bytes vs the previous logged entry and flags any chunk that grew > 10 %.
- [ ] **26.9.6** Vendored Spektrum line — log `public/vendor/spektrum.min.js` size per release so a version-pin bump is always a visible, deliberate change.
- [ ] **26.9.7** Request-count note — record the number of requests before interactive (HTML, CDN import-map fetch, entry chunk, CSS) to keep the first-load waterfall honest.
- [ ] **26.9.8** Gate-friendly design — make the report callable programmatically so the Phase 27 `scripts/verify.mjs` can invoke it without duplication.
- [ ] **26.9.9** Backfill the baseline — log a pre-tuning entry and a post-Phase-26 entry so this phase's wins are recorded as the first delta.
- [ ] **26.9.10** Document the rule — README note: a release without a fresh perf-log entry does not ship.

## Feature 26.10 — Low-end device validation

Desktops hide sins that TVs expose: a 4× CPU-throttle protocol approximates webOS-class hardware locally, with throttled-but-fixed targets and a first set of real-hardware notes that Phase 30 builds on.

- [ ] **26.10.1** Throttle protocol — document the standard run (boot, import 100 k, scroll, search, zap-10) under 4× CPU throttle as the low-end reference workload.
- [ ] **26.10.2** Automate throttling — a `--throttle` flag on the measure scripts applies CDP `Emulation.setCPUThrottlingRate(4)` before driving the workload.
- [ ] **26.10.3** Throttled budgets — fixed relaxed targets (e.g. interactive < 2.5 s, search p95 < 150 ms) recorded under a `throttled` key in `budgets.json`, asserted by the scripts.
- [ ] **26.10.4** Slow-network first visit — an emulated slow-3G pass measures the cold web load including the pinned CDN Spektrum fetch, verifying the import map is not a hidden multi-second stall.
- [ ] **26.10.5** Constrained-heap run — repeat the 100 k import in a Chromium launched with a reduced JS heap and document behavior at the memory margin.
- [ ] **26.10.6** Real-hardware notes — run the protocol on the most webOS-like device available and record numbers and quirks in `masterplan/perf-log.md` as the pre-Phase-30 reference.
- [ ] **26.10.7** Partial-tier throttled boot — force the localStorage tier via a dev flag and verify re-parse-on-boot shows progress while favorites render instantly from their denormalized snapshots.
- [ ] **26.10.8** None-tier throttled session — verify full functionality in-memory with the one-line storage notice, under throttle.
- [ ] **26.10.9** Input-latency spot check — measure keydown→row-highlight for ↑/↓ roving-focus navigation (Phase 25) under throttle; target < 100 ms.
- [ ] **26.10.10** Triage findings — fix the cheap breaches in this phase and record deferred items as decision notes in this file.
