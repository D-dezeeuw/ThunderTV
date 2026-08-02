# Phase 17 — EPG Display

> **Epic goal:** EPG appears in the channel list — now/next with a live progress bar on visible rows only, driven by one global 30 s tick, with zero per-row timers and zero re-renders when nothing changed.
> **Verification:** With EPG imported, visible rows show now/next and a ticking progress bar driven by exactly one 30 s interval (confirmed in the performance panel); one full tick over 40 visible rows measures < 5 ms; a no-change tick causes zero DOM mutations in the rows container; inline detail expands exactly one row at a time; the §3 scroll budgets (≤ ~40 DOM rows, no dropped frames over 90 k channels) hold with EPG enabled; `npm test` and the standing checklist are green.
> **Status:** `superseded` · tracker: `not-maintained` — Superseded by **Phase 32**. The two load-bearing pieces shipped as designed — the single global 30 s tick (`src/state/epg.ts`'s `epg.tick`) and `now-next.ts`'s binary search — but the row and inline-detail design was rebuilt in Phase 32 against the Live list rather than the Phase 08 rows this phase assumed. `src/epg/README.md` is the live reference.

Before this phase, programs sit in storage (Phase 16) but no pixel knows about them. After it, the channel list is EPG-aware end to end: `publishWindow()` decorates the visible slice into `EnrichedChannel` rows at publish time, a single 30 s tick (`epg.tick`) re-enriches that slice, rows show a now/next line and a thin transition-free progress bar only when guide data exists, and clicking the EPG area (not the row) expands one inline detail panel. Now/next resolution is the §6.7 binary search over start-sorted arrays, memoized per programme — the 90 k-row master array is never enriched, only the ≤ ~40 visible rows.

## Feature 17.1 — EnrichedChannel computation

The `EnrichedChannel` pattern ported from thunder-tv: pre-compute now/next onto the rows the DOM will actually see, once per publish, so templates read plain fields and render code never performs lookups. Enrichment decorates only the windowed slice — never the full array (§5.4).

- [ ] **17.1.1** Type definition — define `EnrichedChannel` in `src/epg/enriched-channel.ts`: `Channel` plus `{epgNow?, epgNext?, epgProgress?, epgAvailable}` — computed fields, never persisted.
- [ ] **17.1.2** Publish-time hook — call `enrichVisible()` inside the windowing controller's `publishWindow()` so `setValue('list.visibleRows', …)` always hands `data-each` pre-computed rows.
- [ ] **17.1.3** Memory program cache — back enrichment with a module-memory per-channel program cache (LRU, ~200 channels) filled from storage, so publish never awaits IDB.
- [ ] **17.1.4** Async fill on miss — a cache miss issues one `epgGetRange(channelId, now − 6h, now + 12h)` and republishes the affected rows when it lands, without ever blocking scroll.
- [ ] **17.1.5** Pure core — keep the enrichment function pure over `(programs, now)` so identical inputs always yield identical outputs — the unit-testable heart of the feature.
- [ ] **17.1.6** Honest absence — rows without guide data resolve to `undefined` fields consumed by `data-if`; no sentinel strings like "N/A" anywhere.
- [ ] **17.1.7** Slice-only guarantee — the full channel array stays untouched plain memory; enrichment decorates only the ≤ ~40-row window, asserted in dev builds.
- [ ] **17.1.8** All list surfaces — route the favorites and recent views through the same `enrichVisible()` path so every list renders EPG identically.
- [ ] **17.1.9** Scenario tests — unit test enrichment mid-programme, between programmes, before the first, and after the last programme of a fixture channel.
- [ ] **17.1.10** Scroll audit — fast-scroll a 90 k-channel list with EPG enabled, confirm the DOM row budget and frame rate hold, and note the profile numbers in this phase file.

## Feature 17.2 — Global 30s progress tick

One interval for the whole application (§5.5). The tick writes a single Spektrum value; everything visible derives from it. Idle CPU stays near zero, and no row ever owns a timer.

- [ ] **17.2.1** Tick module — create `src/epg/tick.ts` with one `setInterval(30_000)` writing `setValue('epg.tick', Date.now())` — the app's only recurring EPG timer.
- [ ] **17.2.2** Selective republish — on each tick, re-run `enrichVisible()` over the current window and republish only rows whose now/next ids or whole-percent progress actually changed.
- [ ] **17.2.3** Derived progress — express progress percentages as `computed()` values reading `epg.tick`; no secondary intervals anywhere in display code.
- [ ] **17.2.4** Lazy lifecycle — start the tick on first available EPG data and stop it when no EPG-showing view is active, so an idle settings screen burns zero timers.
- [ ] **17.2.5** Visibility catch-up — fire one immediate tick on `visibilitychange` back to visible so a backgrounded tab updates instantly instead of waiting up to 30 s.
- [ ] **17.2.6** Drift-free math — compute from `Date.now()` at tick time rather than accumulating elapsed counts, so a throttled background timer cannot skew progress.
- [ ] **17.2.7** Tick subscription API — export `onTick(cb)` so the Phase 18 guide's now-marker consumes this tick instead of owning a second interval.
- [ ] **17.2.8** Minimal module — keep `tick.ts` under 100 lines with zero DOM knowledge; it writes state and notifies subscribers, nothing else.
- [ ] **17.2.9** Fake-timer tests — with Vitest fake timers, assert `epg.tick` advances on schedule and an unchanged now/next publishes no new slice reference.
- [ ] **17.2.10** Timer audit — verify in the browser performance panel that exactly one 30 s timer exists with EPG active, and record the observation here.

## Feature 17.3 — Now/next line in channel rows

The channel row gains its "now playing" line — current programme title and time range, next programme dimmed behind it — rendered only when guide data exists, inside the fixed row height, with zero layout shift.

- [ ] **17.3.1** Row template — extend the channel-row partial with an EPG block (current title + `HH:MM–HH:MM` range) gated by `data-if` on the row's `epgNow`.
- [ ] **17.3.2** Next programme — render the next title dimmed after the current one on the same single line, truncating with ellipsis.
- [ ] **17.3.3** Cached formatter — add `formatTime()` in `src/epg/format.ts` using a module-level cached `Intl.DateTimeFormat` instance — constructing one per row is a known perf trap.
- [ ] **17.3.4** No ghost space — rows without EPG render exactly the pre-phase name-only layout; no reserved empty EPG area.
- [ ] **17.3.5** Fixed heights hold — verify the EPG line fits within the existing density boxes (compact 32 px / comfortable 44 px, §6.1); if a height constant must change, change it once deliberately and note the decision.
- [ ] **17.3.6** CSS-only truncation — use `text-overflow: ellipsis` in fixed-width flex boxes; no JS measuring or string slicing.
- [ ] **17.3.7** Strings module — route static labels through the central strings module.
- [ ] **17.3.8** Zero template calls — the `data-each` row template reads only pre-computed `EnrichedChannel` fields; no function calls in per-row template expressions.
- [ ] **17.3.9** Visual pass — check both densities with very long titles and mixed-script channel names; attach a screenshot reference in the phase notes.
- [ ] **17.3.10** Formatter tests — unit test `formatTime` around midnight and a 23:30–00:15 programme spanning the day boundary.

## Feature 17.4 — Thin progress bar

A 2 px bar under the programme line whose width jumps on each tick — width updates only, no CSS transitions (state changes are instant, per the standing convention), no date math in templates.

- [ ] **17.4.1** Bar markup — add the progress element to the row's EPG block with width bound as `:style="'width:' + row.epgProgress + '%'"` from the pre-computed value.
- [ ] **17.4.2** No transitions — assert no `transition`/`animation` property touches the bar; the width snaps on tick per the no-animation rule.
- [ ] **17.4.3** Precomputed percent — compute `epgProgress` once in `enrichVisible()` (clamped 0–100); the template never touches timestamps.
- [ ] **17.4.4** Hidden when idle — hide the bar entirely via `data-if` when no current programme exists, avoiding 0 %-width ghost elements.
- [ ] **17.4.5** Token colors — build the bar from a background/foreground div pair using `tokens.css` custom properties; no gradients, no literal colors.
- [ ] **17.4.6** Whole-percent rounding — round progress to whole percent so the 17.2 change-comparison ignores sub-percent drift between ticks.
- [ ] **17.4.7** No layout shift — position the bar absolutely at the bottom of the EPG block so its presence never moves text within the fixed row box.
- [ ] **17.4.8** Contrast check — verify bar colors against the dark theme; add a token rather than a literal if a new color is needed.
- [ ] **17.4.9** Clamp tests — unit test progress at programme start (0), at end (100), and outside any programme (bar hidden).
- [ ] **17.4.10** Tear check — manually confirm a tick landing mid-scroll cannot tear the bar, because tick and scroll both funnel through the single publish path.

## Feature 17.5 — Inline program detail expansion

"Information on demand": clicking the row's EPG area — not the row, which still plays — expands one inline detail panel with the full programme. One expanded row exists at a time, and the virtual list's math accounts for its fixed extra height without ever measuring.

- [ ] **17.5.1** Separate click target — make the EPG block its own `data-action="click:toggleEpgDetail"` target so clicking the channel name still plays the channel.
- [ ] **17.5.2** Toggle action — `defineFn('toggleEpgDetail', …)` writes `setValue('epg.expandedChannelId', id)` with toggle semantics; a single expanded row by design.
- [ ] **17.5.3** On-demand detail data — on expand, fetch the channel's window around now via `epgGetRange` and render full title, time range, description, category, and icon — full timelines load only when asked for (plan §5 caching rules).
- [ ] **17.5.4** Windowing exception — teach the windowing controller exactly one variable-height case: the expanded row's height is `ROW_H + DETAIL_H`, both fixed constants — never measured.
- [ ] **17.5.5** Auto-collapse — collapse when the row scrolls beyond the overscan, on Escape, or when another row expands.
- [ ] **17.5.6** Instant appearance — the panel appears and disappears with no animation; no transition classes exist on it.
- [ ] **17.5.7** Keyboard toggle — with a row focused, the `i` key toggles its detail, consistent with the app's keyboard-first rules.
- [ ] **17.5.8** Bounded height — clamp long descriptions to the fixed `DETAIL_H` with internal `overflow-y: auto`; the row block never grows unbounded.
- [ ] **17.5.9** Invariant tests — unit test the toggle action and the single-expansion invariant across rapid expand requests.
- [ ] **17.5.10** Spacer verification — manually expand, scroll away, and zap channels; confirm `padTop`/`padBottom` stay correct and no row sticks expanded.

## Feature 17.6 — Visible-rows-only batch enrichment

The §6.7 binary search over start-sorted program arrays, run as one batch per publish for the visible slice — 40 searches in microseconds, memoized until the current programme actually ends. The full array never pays for EPG.

- [ ] **17.6.1** nowNext core — implement `nowNext(programs, now)` in `src/epg/now-next.ts` exactly per MASTERPLAN §6.7: binary search on the start-sorted array returning `{now?, next?}`.
- [ ] **17.6.2** One batch per publish — a single `enrichVisible()` pass resolves now/next for every visible row; nothing resolves lazily from render code.
- [ ] **17.6.3** Bound assertion — dev-build assert that `enrichVisible()` never receives more than `windowSize + 2 × overscan` rows — the windowing-regression tripwire.
- [ ] **17.6.4** Reference stability — reuse a row's previous `EnrichedChannel` object when its now/next ids and rounded progress are unchanged, so Spektrum reconciliation skips the row entirely.
- [ ] **17.6.5** Sorted by contract — rely on storage returning start-sorted arrays and preserve order in the memory cache; never re-sort at enrichment time.
- [ ] **17.6.6** Boundary memoization — memoize `(channelId → {now, next, validUntil: now.stop})` so ticks within the same programme skip even the binary search.
- [ ] **17.6.7** Edge hardening — make empty and single-programme arrays return clean `undefined`s with no `undefined.stop` hazards.
- [ ] **17.6.8** Edge-case tests — cover now before all programmes, inside a gap, exactly at a start, exactly at a stop, and after all programmes.
- [ ] **17.6.9** Property test — for randomized sorted fixtures, assert `nowNext` agrees with a linear-scan reference implementation.
- [ ] **17.6.10** Micro-benchmark — time 40 rows × binary search over 300-programme arrays and assert it lands far inside the 5 ms tick budget.

## Feature 17.7 — Per-channel EPG availability flag

Whether the EPG area renders at all is a per-row boolean answered by the Phase 16.8 index — a synchronous Map hit at publish time. Three states exist: has data, mapped but empty window, and no mapping at all.

- [ ] **17.7.1** Flag resolution — resolve `epgAvailable` on each `EnrichedChannel` via `hasEpg()` from the 16.8 channel index during enrichment.
- [ ] **17.7.2** Template gate — gate the entire EPG block (line, bar, click target) on the flag so unmapped rows render no empty scaffolding.
- [ ] **17.7.3** Three-state rendering — distinguish "mapped but no programmes in window" (subtle "no data" line) from "no mapping" (nothing rendered).
- [ ] **17.7.4** Live recompute — after every EPG import summary (and later, mapping changes from Phase 18), rebuild the index and republish the window once so availability flips without a reload.
- [ ] **17.7.5** Synchronous only — availability must be a Map lookup at publish time; a storage read here would stall every scroll publish.
- [ ] **17.7.6** Coverage metric — expose channels-with-EPG / total for the active playlist on the sources view as an ingestion-quality signal.
- [ ] **17.7.7** Derived state — keep the flag off persisted channel rows; it recomputes from the index every session and after every import.
- [ ] **17.7.8** State tests — unit test the three-state logic: available with data, available with an empty window, and unavailable.
- [ ] **17.7.9** Flip test — unit test that an import summary flips availability in-session via index rebuild plus republish.
- [ ] **17.7.10** Mixed-playlist smoke — verify a playlist where only some channels carry tvg-ids renders mixed rows correctly at both densities.

## Feature 17.8 — Timezone and offset correctness

Times are UTC epoch milliseconds everywhere except the last formatting step. Comparisons are pure epoch arithmetic (DST cannot break them); only `Intl` touches the user's zone. This feature proves the Phase 16 offset parsing survives all the way to the pixel.

- [ ] **17.8.1** Epoch-only storage — type all program times as `number` (UTC epoch ms) and confirm no `Date` strings or local-time values can reach storage.
- [ ] **17.8.2** Intl-only display — format exclusively through `Intl.DateTimeFormat` with the implicit local zone; no manual offset arithmetic exists in display code.
- [ ] **17.8.3** End-to-end offset check — feed a `+0200` fixture programme through ingestion and assert the row shows the correct local wall-clock time.
- [ ] **17.8.4** DST invariant — document in `now-next.ts` that comparisons are pure epoch math and only formatting is zone-aware; this is the DST-safety argument.
- [ ] **17.8.5** Mixed-offset feeds — prove ordering stays correct for a channel whose programmes carry different offsets (real providers do this) — normalization already yields UTC, add the test that locks it.
- [ ] **17.8.6** Formatter lifecycle — cache the `Intl` formatter and define the rebuild point if a time-format setting ever appears (24 h default; decision noted).
- [ ] **17.8.7** Unit guard — dev-assert `start > 10^12` at the storage boundary to catch epoch-seconds-vs-milliseconds mistakes instantly.
- [ ] **17.8.8** DST-transition tests — assert a programme spanning a clock change formats correct local start and end times.
- [ ] **17.8.9** Offset-notation tests — assert `-0000`, `+0000`, and missing-offset inputs produce identical UTC values.
- [ ] **17.8.10** Two-zone smoke — manually verify a known fixture under two different system timezones and record both observations in the phase file.

## Feature 17.9 — EPG display performance validation

The §3 budgets, checked with instruments rather than optimism: a tick costs < 5 ms at 40 visible rows, an unchanged tick moves zero DOM nodes, and the initial-bundle budget is untouched.

- [ ] **17.9.1** Tick timing test — add a timed test measuring one full tick (`enrichVisible` over 40 rows, cold and memo-warm) asserting < 5 ms.
- [ ] **17.9.2** Dev instrumentation — wrap enrichment in `performance.mark`/`measure` pairs in dev builds, stripped via `import.meta.env.PROD`.
- [ ] **17.9.3** Zero-mutation proof — in a DOM test, observe the rows container across a no-change tick with `MutationObserver` and assert zero mutations.
- [ ] **17.9.4** Identity test — unit test object-identity stability of unchanged rows across ticks (locks 17.6.4 behavior).
- [ ] **17.9.5** Idle-CPU profile — profile five idle minutes with EPG active: one 30 s wakeup, no accumulating timers; record the trace summary here.
- [ ] **17.9.6** Cache-bound check — heap-snapshot before and after scrolling the full 90 k list and confirm the 200-channel LRU keeps program memory flat.
- [ ] **17.9.7** Scroll regression — re-run the Phase 08 scroll benchmark with EPG enabled and assert the frame budget still holds.
- [ ] **17.9.8** Bundle budget — check the Vite build size report: EPG display code stays inside the ≤ ~60 KB gz app-code budget with no new eager dependencies.
- [ ] **17.9.9** Regression tripwire — keep a dev warning if `enrichVisible` ever processes more than 120 rows, catching windowing regressions early.
- [ ] **17.9.10** Numbers table — record every measured figure as a table in this phase file for release-time comparison per §3's manual budget checks.

## Feature 17.10 — EPG selector unit tests

The derivation layer — enrichment, tick, availability, cache — is pure enough to test exhaustively and fast. This suite is the safety net under Phases 18 and 20, which both reuse these selectors.

- [ ] **17.10.1** Fixture module — consolidate `src/epg/__fixtures__/programs.ts` with named scenarios: dense day, sparse gaps, single programme, empty channel.
- [ ] **17.10.2** Enrichment suite — test `enrichVisible` attaches now/next/progress/availability correctly for every named scenario.
- [ ] **17.10.3** Tick derivation — with fake timers, test that derived values recompute on `epg.tick` changes and only then.
- [ ] **17.10.4** Availability edges — test id-present-but-empty, id-absent, and case-mismatched ids resolved by `normalizeEpgId`.
- [ ] **17.10.5** LRU behavior — test eviction order, refill on miss, and that concurrent misses for one channel issue a single in-flight range query.
- [ ] **17.10.6** Expanded-row math — test the windowing controller's `padTop`/`padBottom` with one expanded row at various scroll positions.
- [ ] **17.10.7** Deterministic formatting — pin `Intl` options (fixed locale and zone) in format tests so CI results never depend on the runner's environment.
- [ ] **17.10.8** Memo invalidation — test the memoized `nowNext` invalidates exactly at `validUntil` when a tick crosses a programme boundary.
- [ ] **17.10.9** Fast and isolated — keep the suite under 2 s using the memory tier only; no real IndexedDB in selector tests.
- [ ] **17.10.10** Suite integration — wire everything into `npm test` and confirm the full standing verification checklist passes on the combined run.
