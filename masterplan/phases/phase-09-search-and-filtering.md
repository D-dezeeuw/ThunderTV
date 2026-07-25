# Phase 09 — Search & Filtering

> **Epic goal:** Instant search over 90 k channels — debounced at 150 ms, incrementally narrowed, normalization-aware via the ported strip-country-prefix logic — combined with a group filter under clear intersection semantics, and fully drivable from the keyboard.
> **Verification:** On the built `dist/` with the 90 k fixture, `npm run bench:search` shows < 50 ms p95 from keystroke to published window; typing with diacritics and country prefixes finds the expected channels; the `/`→type→ArrowDown→Enter flow works without a pointer; combined search+group filtering follows the documented matrix in every case.

Before this phase the list renders and scrolls but finding one channel among 90 000 means scrolling for it. After it, a search box with a 150 ms debounce filters module memory through normalized, incrementally narrowed matching; a group dropdown intersects with the query under documented clear rules; results show counts, empty states, and cheap single-`<mark>` highlighting — all flowing through Phase 08's single `setRows` choke point, with the < 50 ms keystroke budget from MASTERPLAN.md §3 locked in by a benchmark.

## Feature 09.1 — Search input with 150ms debounce

The plan's budget line is explicit — "debounced 150 ms, incremental filter" — so the input echoes instantly while filtering waits for the typing pause, and the machinery lives in a dedicated state module.

- [ ] **09.1.1** Add the search input to the list header per the plan §9 layout, bound with `data-model="search.query"` — the query is a scalar, safe for recorded state, and the native input echoes keystrokes with zero framework latency.
- [ ] **09.1.2** Create `src/state/search.ts` owning the debounce — a 150 ms timer reset on every query change; only its expiry triggers a filter run.
- [ ] **09.1.3** Execute the filter over the module-memory row array and hand the result to `virtual-list.ts`'s `setRows` — search never touches storage and never bypasses the Phase 08 choke point.
- [ ] **09.1.4** Short-circuit the empty query — clearing restores the unfiltered array via `setRows` immediately, skipping both debounce and filter entirely.
- [ ] **09.1.5** Respect IME composition — listen for `compositionstart`/`compositionend` and hold filtering until composition ends, so CJK input does not filter on half-composed syllables.
- [ ] **09.1.6** Add a clear button (×) inside the input that resets the query and returns focus to the field, plus placeholder text from the strings module.
- [ ] **09.1.7** Keep pure matching logic in `src/ui/search-filter.ts` and orchestration in `state/search.ts` — both ≤ 300 lines, with the filter functions individually exported for the Feature 09.9 bench.
- [ ] **09.1.8** Spec the debounce with fake timers — ten rapid keystrokes yield exactly one filter run, and a keystroke at 149 ms restarts the window.
- [ ] **09.1.9** Ensure a filter run scheduled before a source switch is discarded — the debounce timer is cancelled on `setRows`-driven source changes so a stale query never filters the new source's rows unrequested.
- [ ] **09.1.10** Verify input responsiveness under load — typing during an active 90 k filter run must not drop characters; confirm the filter runs synchronously fast enough (per Feature 09.9) that this holds without worker offloading, and note the decision.

## Feature 09.2 — Incremental narrowing (reuse previous result set while the query only grows)

Filtering 90 k rows on every keystroke is wasteful when "spor" can only match within "spo"'s results — narrowing over the previous result set is the plan's named trick for staying far under the 50 ms budget.

- [ ] **09.2.1** Cache the previous normalized query and its result array in `state/search.ts`; when the new normalized query extends the cached one (`startsWith`) under the same group filter, filter only the cached results.
- [ ] **09.2.2** Fall back to a full-array scan on any non-extending edit — backspace, mid-string edits, or paste-replacement — correctness always beats the shortcut.
- [ ] **09.2.3** Keep result arrays as arrays of row references — no row copies, so even deep prefix chains cost only pointer arrays.
- [ ] **09.2.4** Key the cache on the `(group, normalizedQuery)` pair — a group-filter change invalidates the prefix chain even when the text kept growing.
- [ ] **09.2.5** Retain exactly one cache generation — the previous result set, nothing deeper; memory stays bounded at one pointer array regardless of typing history.
- [ ] **09.2.6** Invalidate the cache on `setRows`-level changes — source switch, refresh, or favorites-view entry all reset it, wired into the same code path that swaps the module array.
- [ ] **09.2.7** Compare prefixes on normalized text — the extension check runs after Feature 09.3's normalization so case and diacritic changes that normalize identically still take the fast path.
- [ ] **09.2.8** Write a property-style spec — for seeded random query sequences over a fixture, the incremental path's results always equal a from-scratch filter's results.
- [ ] **09.2.9** Benchmark warm-path narrowing — a keystroke extending a query over the 90 k fixture must land well under the 50 ms budget; record cold vs warm numbers side by side in this file.
- [ ] **09.2.10** Unit-test the invalidation matrix — extend, backspace, group change, source switch, and clear each hit the expected path (cached vs full), asserted via an instrumented filter counter.

## Feature 09.3 — Text normalization (case, diacritics, ported strip-country-prefix)

"tele" must find "Télé", and "CNN" must find "US | CNN" — matching runs over a normalized shadow of each name, computed once at parse time so query-time cost is zero.

- [ ] **09.3.1** Implement `normalizeSearchText()` in `src/m3u/search-normalize.ts` — lowercase, Unicode NFD, strip combining marks — one exported function shared by row precompute and query normalization alike.
- [ ] **09.3.2** Precompute each row's normalized search name in the parser worker during Feature 06.5's mapping and persist it on `ChannelRow.searchName` — boot from cache means search is instant with no warm-up pass; record the size-vs-speed decision note.
- [ ] **09.3.3** Fold the ported `stripCountryPrefix` into the precompute — `searchName` covers both the raw and the stripped form (stripped appended when it differs), so "CNN" matches "US | CNN" without a second field.
- [ ] **09.3.4** Choose deterministic case folding — `toLowerCase()` over locale-sensitive folding, documenting the Turkish-İ trade-off as a decision note; determinism across devices beats locale nuance here.
- [ ] **09.3.5** Scope matching to channel names only for this phase — no tvg-id or group-name matching — and record the scope decision so Phase 19 can revisit for Xtream content.
- [ ] **09.3.6** Trim and collapse whitespace in queries before normalization, and treat a whitespace-only query as empty.
- [ ] **09.3.7** Keep the util dependency-free and worker-safe — it runs inside `parser.worker.ts` at import time and on the main thread at query time, so it may import nothing beyond the ported strip util.
- [ ] **09.3.8** Port the matching-relevant `strip-country-prefix.util.spec.ts` cases into the normalization spec — the "Sky - Sports F1" non-tag and "|DE| ARD" leading-separator cases must hold through the combined pipeline.
- [ ] **09.3.9** Spec diacritic folding broadly — "Télé", "München", "Кино" (Cyrillic passes through unchanged), and combining-mark edge cases all match their folded queries.
- [ ] **09.3.10** Measure the precompute cost on the 100 k fixture inside the Phase 06 bench — NFD over 100 k names must fit invisibly inside the existing < 5 s import budget; record the delta.

## Feature 09.4 — Group filter dropdown

Groups are the other axis of finding things — a native select fed by `GroupMeta` costs almost nothing, works with TV remotes for free, and narrows the search domain before any text matching runs.

- [ ] **09.4.1** Render the group filter as a native `<select>` in the list header, populated from the `groups` store's `GroupMeta` — native for TV-remote and accessibility behavior at zero cost; note the choice over a custom popover.
- [ ] **09.4.2** Label each option "Name (count)" using the stored counts, with "All groups (total)" as the default first entry.
- [ ] **09.4.3** Apply the filter through the cached per-group index arrays built in Feature 08.5 — selecting a group reuses those row indices rather than scanning 90 k rows.
- [ ] **09.4.4** Store `search.group` in Spektrum state and include it in the Feature 08.6 per-source persistence map so a reload restores the active group filter.
- [ ] **09.4.5** Bind changes via `data-action="change:onGroupFilterChange"` dispatching into the same `applyFilters()` entry point as text search.
- [ ] **09.4.6** Verify the dropdown stays usable at the 10 000-group cap fixture — native selects handle thousands of options; confirm open latency is acceptable and note the measurement.
- [ ] **09.4.7** Keep the `Ungrouped` bucket selectable and ordered last, mirroring the group panel's ordering from Phase 08.
- [ ] **09.4.8** Reset to "All groups" when switching sources, since group names are per-playlist — restore only from the per-source persisted state, never carried across sources.
- [ ] **09.4.9** Test that selecting a group updates the published window to that group's rows and updates the result count line in the same tick.
- [ ] **09.4.10** Test the restore path — persisted group filter survives `simulateReload()` and reapplies before the first window publish for that source.

## Feature 09.5 — Combined search+group semantics (intersection, clear rules)

When both filters are active the result is their intersection — obvious until edge cases hit; this feature pins the semantics in one entry point and one documented matrix so behavior is never accidental.

- [ ] **09.5.1** Implement the single `applyFilters()` entry point in `state/search.ts` — group filter narrows first (cheap index lookup), text filter runs over the narrowed set, and the result flows to `setRows` in one call.
- [ ] **09.5.2** Define the clear rules — clearing the query keeps the group filter, clearing the group keeps the query, and each clearing action re-runs `applyFilters()` over what remains.
- [ ] **09.5.3** Guarantee one publish per user action — no intermediate `setRows` between group narrowing and text filtering, so the list never flashes a half-filtered state.
- [ ] **09.5.4** Derive `search.resultCount` and `search.totalCount` inside the same pass — no second counting iteration over the result array.
- [ ] **09.5.5** Wire the incremental cache's group key from Feature 09.2 — a group switch mid-typing invalidates the prefix chain, then extension resumes against the new narrowed base.
- [ ] **09.5.6** Preserve selection across filter changes when possible — if the selected row survives the new filter it stays selected and the window scrolls to it; otherwise selection moves to the first result (Feature 08.7's invalidation rule).
- [ ] **09.5.7** Reset scroll to top on every filter change, and keep the Feature 08.6 persisted scroll position exclusively for the unfiltered view — filtered scroll positions are transient by design; note the decision.
- [ ] **09.5.8** Write the semantics matrix as a table-driven spec — {query, no-query} × {group, no-group} × {clear-query, clear-group, clear-both} asserting exact result sets on a hand-built fixture.
- [ ] **09.5.9** Document the state shape and the ordering rationale (group-first narrowing) in `state/search.ts` JSDoc — the contract Feature 09.8 and Phase 20's Xtream lists reuse.
- [ ] **09.5.10** Assert filtered arrays obey the module-memory contract — the intersection result is a plain array handed to `setRows`, and the §5.8 setValue guard from Phase 08 stays silent throughout the matrix spec.

## Feature 09.6 — Result count and no-results empty state

Filtering without feedback is guesswork — a count line says how much matched, and a purposeful empty state turns zero results into a next action instead of a dead end.

- [ ] **09.6.1** Render "N of M channels" in the list header from `search.resultCount`/`search.totalCount`, visible only while any filter is active — minimal by default, per the product's core principle.
- [ ] **09.6.2** Reserve the count line's space in the header layout so its appearance and disappearance never shifts the list below it.
- [ ] **09.6.3** Build the no-results state — the active query echoed back ("No channels match 'sprots'"), shown in the list body when the result set is empty.
- [ ] **09.6.4** Offer recovery actions in the empty state — "Clear search" and, when a group filter is active, "Search all groups" which drops the group and re-runs the query.
- [ ] **09.6.5** Update count and window in the same tick — both derive from the single `applyFilters()` pass, so the count can never disagree with what the list shows.
- [ ] **09.6.6** Reuse the count-aware pluralization helper from Feature 07.6's strings work — "1 of 90 000 channels" formats correctly without a second formatting path.
- [ ] **09.6.7** Route every empty-state and count string through the strings module, including the echoed-query interpolation.
- [ ] **09.6.8** Handle Esc from the empty state — it clears the query (Feature 09.7's rule) and the empty state resolves back to the full list in one action.
- [ ] **09.6.9** Spec the count across the Feature 09.5 matrix — every combination asserts the exact "N of M" values, including N = 0 and the unfiltered hidden state.
- [ ] **09.6.10** Test that the empty state renders no channel rows and no spacer heights — `list.visibleRows` is `[]` and both pads are zero, not leftovers from the previous window.

## Feature 09.7 — Keyboard flow (/ focuses search, Esc clears, ArrowDown enters list)

Search must be reachable, usable, and dismissible without a pointer — the same flow a TV remote produces — and the keymap lives in one module the later accessibility phase extends.

- [ ] **09.7.1** Centralize shortcuts in `src/app/keymap.ts` — one keydown listener at the app root dispatching named actions, the module Phase 25 extends with the full plan §9 map.
- [ ] **09.7.2** Bind `/` to focus the search input — suppressed while focus is already in any input or textarea so typing a literal `/` in the URL import field still works.
- [ ] **09.7.3** Implement the two-stage Esc — first press clears the query (input keeps focus), second press blurs the input and returns focus to the list at the current selection.
- [ ] **09.7.4** Bind ArrowDown from the search input to move focus into the list and select the first result row, scrolling it into the window.
- [ ] **09.7.5** Wire Enter on a selected result to the `setActiveChannel` dispatch stub from Feature 08.7 — the `/`→type→ArrowDown→Enter chain is complete even before playback exists.
- [ ] **09.7.6** Decide against type-ahead from the list — printable keys while the list has focus do not redirect into search (TV remotes emit unexpected keys); only `/` activates, recorded as a decision note.
- [ ] **09.7.7** Suspend list/search shortcuts while the settings panel or any modal surface is open — the keymap module exposes a scope stack rather than each surface adding its own guards.
- [ ] **09.7.8** Style a visible focus ring for the input and rows from tokens — instant appearance, no transition, sufficient contrast on the dark theme.
- [ ] **09.7.9** Add a Playwright test driving the full sequence — `/`, type "cnn", ArrowDown, Enter — asserting focus positions at each step and the final dispatch on the 10 k fixture.
- [ ] **09.7.10** Document the phase's keymap additions in this file and surface a hint in the search placeholder ("Press / to search") via the strings module.

## Feature 09.8 — Search within favorites/recent views

Favorites are the boot-time fast path on constrained devices — searching them must work from denormalized snapshots alone, before any playlist has re-parsed, through the exact same filter code.

- [ ] **09.8.1** Run `applyFilters()` over the active view's row set — the favorites or recent snapshot array replaces the full playlist array as the filter base, with zero new filter code.
- [ ] **09.8.2** Normalize snapshots at write time — Feature 08.8's `toggleFavorite` computes `searchName` for the snapshot with the same `normalizeSearchText()`, so favorites search needs no playlist rows in memory.
- [ ] **09.8.3** Clear the query on view switches (list ↔ favorites ↔ recent) — per-view query persistence is more state than the interaction is worth; recorded as a decision note.
- [ ] **09.8.4** Hide the group filter dropdown in favorites/recent — snapshot rows keep a `group` field for display, but group navigation is a playlist concept; the header collapses to search + count.
- [ ] **09.8.5** Let the incremental cache work unchanged — it keys on the filter base identity, so switching views resets it via the same invalidation as a source switch, no special-case branches.
- [ ] **09.8.6** Scope the count line per view — "3 of 41 favorites", "2 of 100 recent" — reusing the pluralization helper with view-specific strings.
- [ ] **09.8.7** Verify the partial-tier fast path — with playlists not yet re-parsed after boot, favorites search over localStorage-restored snapshots returns correct results; covered in the storage-matrix suite.
- [ ] **09.8.8** Keep recent's cap semantics visible — the view filters over at most 100 snapshot rows (plan §5 cap), trivially fast but still flowing through `applyFilters()` so behavior stays uniform.
- [ ] **09.8.9** Reuse the identical keyboard flow — `/`, Esc, ArrowDown, Enter behave the same in these views, asserted by extending the Feature 09.7 Playwright test across views.
- [ ] **09.8.10** Spec favorites search end-to-end — favorite three fixture channels, simulate reload on the partial tier, search by stripped prefix and by diacritic-folded name, assert hits.

## Feature 09.9 — Search latency budget test (<50ms per keystroke on 90k fixture)

The 50 ms number from MASTERPLAN.md §3 is a release gate — this feature builds the harness that measures keystroke-to-published-window end to end and fails loudly when the budget breaks.

- [ ] **09.9.1** Build the bench harness around scripted keystroke sequences over the imported 90 k fixture — realistic queries (common words, prefixes, diacritics) driven against the real `state/search.ts` path.
- [ ] **09.9.2** Measure end to end — from query-value change to the `setRows`-triggered window publish completing, so the budget covers filtering plus the ≤ 40-row Spektrum reconciliation, not just the array scan.
- [ ] **09.9.3** Include the worst case — a one-character query producing the largest possible result set — as its own tracked scenario.
- [ ] **09.9.4** Report cold (full-scan) and warm (incremental) timings separately, asserting < 50 ms p95 for both across the scripted set.
- [ ] **09.9.5** Use a stable methodology — N repeated runs per scenario, report median and p95, discard the first warm-up run to keep JIT and GC noise out of the gate.
- [ ] **09.9.6** Confirm query-time normalization cost is flat — `searchName` precompute means per-keystroke normalization touches only the query string; assert the normalization share of the measurement is microseconds.
- [ ] **09.9.7** Expose the harness as `npm run bench:search`, runnable against the built `dist/` like its Phase 06 and 08 siblings.
- [ ] **09.9.8** Run the suite CPU-throttled 4× as the TV proxy and record both result tables in this phase file as the Phase 26 baseline.
- [ ] **09.9.9** Add the always-on guard — a Vitest perf smoke filtering the 10 k fixture under a generous ceiling so gross regressions surface in every `npm test` run without flaky tight bounds.
- [ ] **09.9.10** Fail the bench non-zero past budget — the standing verification checklist's "search < 50 ms" line becomes an executable command rather than a manual judgment.

## Feature 09.10 — Cheap match highlighting (no re-layout, single <mark> per row)

Highlighting sells search as instant — but only if it costs nothing: one `<mark>` per row, computed for the ~40 visible rows only, styled so text metrics never change and layout never runs.

- [ ] **09.10.1** Compute highlights at publish time for the visible slice only — the windowing controller decorates the ≤ 40 outgoing rows with a match range; the full result set is never scanned for highlight positions.
- [ ] **09.10.2** Mark only the first match per row name — a single range, resolving the "cheap" requirement by construction; subsequent occurrences stay unmarked.
- [ ] **09.10.3** Map match positions against the displayed name — run the match on the normalized form of the display string (post `applyChannelNameStrip`) and map the range back through an offset table that accounts for NFD-stripped combining marks.
- [ ] **09.10.4** When the match falls only inside a stripped country prefix (hidden from display), render no mark — the row matched, the highlight has nothing visible to point at; recorded as a decision note.
- [ ] **09.10.5** Render the name as at most three sibling spans (pre / mark / post) in the row template via `data-if`-guarded segments — never `innerHTML`, never DOM built from strings.
- [ ] **09.10.6** Style `<mark>` with a background token only — no font-weight or size change, so glyph metrics are identical and the fixed-height row never re-layouts.
- [ ] **09.10.7** Skip the entire decoration pass when no query is active — unfiltered publishes carry no highlight data and render the single-span fast path.
- [ ] **09.10.8** Spec mark-position correctness — case-insensitive matches, diacritic-folded matches ("tele" marking "Télé"), and matches spanning the strip boundary all assert exact pre/mark/post text.
- [ ] **09.10.9** Verify injection safety — channel names containing `<`, `&`, and quote characters render as text through the span path; add a hostile-name fixture to the spec.
- [ ] **09.10.10** Measure decoration cost inside the Feature 09.9 harness — highlighting adds < 1 ms to a publish, asserted as part of the end-to-end budget rather than a separate untracked pass.
