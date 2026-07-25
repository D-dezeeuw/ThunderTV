# Phase 18 — EPG Guide & Mapping

> **Epic goal:** The two "information on demand" EPG surfaces: a bounded favorites-only guide grid (channels × time, never a 90 k multi-EPG wall) and a mapping layer that fixes mismatched channel ids with exact matching, a manual dialog, and per-channel time offsets.
> **Verification:** The Guide view renders favorites × a ~6 h window with bounded DOM (cells materialized for the visible window only), jump-to-now works, and the whole view is operable keyboard-only (arrows/Enter/Escape); the tvg-id auto-match pass reports matched/unmatched counts in the sources view; a manual mapping plus a +60 min offset survives a reload and a playlist refresh on both the full and partial tiers; `npm test` including the storage matrix over `epgMappings` and the standing checklist are green.

Before this phase, EPG lives only inside channel rows (Phase 17), and a channel whose tvg-id disagrees with the XMLTV feed simply shows nothing. After it, an icon-rail Guide view lays favorited channels against a scrolling 30-minute time axis with a live now marker, program cells open an inline detail panel, and `src/epg/matching.ts` resolves every channel through one precedence chain — manual mapping → exact tvg-id → bounded exact-name fallback → none. Manual mappings (with optional ± minute offsets) persist under stable per-source keys on both durable tiers, so a partial-tier TV keeps its hand-tuned guide across reboots.

## Feature 18.1 — Favorites-only guide grid layout

The guide is deliberately bounded: exactly the favorites list as rows, a fixed time window as columns. That bound is what makes a TV-friendly grid affordable with no virtual-scroll heroics in the vertical axis and no per-cell layout queries.

- [ ] **18.1.1** Routed lazy view — add the Guide at `#/guide` from the icon rail, loaded via dynamic `import()` so non-guide users never download it.
- [ ] **18.1.2** Grid skeleton — build a sticky left channel column (logo + name from the denormalized favorites snapshots) beside a horizontally scrolling time area, using CSS grid with fixed row heights and zero measuring.
- [ ] **18.1.3** Favorites as rows — rows are exactly the favorites list in favorites order — bounded by design per plan §9; no other channel set is ever gridded.
- [ ] **18.1.4** Arithmetic cell placement — position each program cell absolutely within its row track with `left`/`width` computed from `(start − windowStart) / msPerPixel` — pure math, no layout reads.
- [ ] **18.1.5** Fixed window — materialize a fixed ~6 h window at a time; scrolling shifts the window contents (18.3), never the DOM size.
- [ ] **18.1.6** Empty state — with zero favorites, show a centered hint linking to the channel list ("favorite channels to build your guide"), strings via the central strings module.
- [ ] **18.1.7** Unmapped rows — favorites without guide data render one full-width "no guide data" cell carrying a "Map channel" affordance that opens the 18.7 dialog.
- [ ] **18.1.8** Instant everything — no transitions or animations anywhere in the grid; the time area scrolls with native `overflow-x` and the channel column uses `position: sticky`.
- [ ] **18.1.9** File split — keep every file ≤ 300 lines by splitting into `src/epg/guide/{guide-view.ts, guide-window.ts, guide-cells.ts}`.
- [ ] **18.1.10** DOM-count smoke — render 20 favorites × 6 h, confirm instant paint and smooth horizontal scroll, and record the DOM node count in this phase file.

## Feature 18.2 — Time axis with now marker

A sticky header of 30-minute columns, a 1 px vertical now line that rides the Phase 17 global tick, and a jump-to-now action. The axis window is one state value; labels, cells, and marker all derive from it.

- [ ] **18.2.1** Column header — render a sticky header row of 30-minute labels formatted through the shared cached `Intl` formatter from Phase 17.
- [ ] **18.2.2** Tick-driven marker — draw the now line at an offset computed from `Date.now()`, repositioned via the `onTick()` subscription from 17.2.7 — no second interval in the app.
- [ ] **18.2.3** Jump to now — a button scrolls the time area so the now line sits at ~25 % of the viewport width, using instant `scrollTo` (no smooth behavior).
- [ ] **18.2.4** Sensible defaults — open the guide pre-scrolled to now; remember the last scroll offset per session in Spektrum state.
- [ ] **18.2.5** Day boundaries — insert a date label into the axis at each midnight column.
- [ ] **18.2.6** Single source of truth — derive labels, cell placement, and the marker from one `guide.windowStart` value so a window shift updates all three consistently.
- [ ] **18.2.7** Range clamp — clamp navigation to the stored data range (the pruned 24 h floor to the 3-day horizon cap) so users cannot scroll into guaranteed emptiness.
- [ ] **18.2.8** Token gridlines — draw half-hour gridlines as background borders from `tokens.css`; no images, no gradients.
- [ ] **18.2.9** Math tests — unit test the marker offset computation and the clamping behavior at both range ends.
- [ ] **18.2.10** Label tests — unit test axis label generation across a midnight boundary and a DST transition.

## Feature 18.3 — Guide virtualization

Only the visible time window's cells exist in the DOM — bounded by favorites count × ~6 h of 30-minute slots. Data comes in one `IDBKeyRange` query per favorite per window shift, shared with the Phase 17 memory cache.

- [ ] **18.3.1** Window-only cells — materialize program cells for the visible window ± 30 min overscan per row; anything outside simply is not in the DOM.
- [ ] **18.3.2** Batched range queries — on window shift, issue one `epgGetRange(channelId, windowStart − 1h, windowEnd + 1h)` per favorite via `IDBKeyRange.bound` — favorites-count queries, bounded and parallel-safe.
- [ ] **18.3.3** rAF-throttled shifts — throttle horizontal-scroll window recomputation with `requestAnimationFrame`, exactly like the vertical list in §6.1.
- [ ] **18.3.4** One published value — publish cells as `guide.rows` (array of `{channelId, cells[]}`) consumed by nested `data-each`; total cell count stays bounded by favorites × ~14 slots.
- [ ] **18.3.5** Edge clipping — clip programmes overlapping the window edge (render from `max(start, windowStart)`) with a `‹` continuation prefix on the clipped cell.
- [ ] **18.3.6** Shared cache — read and fill the same module-memory per-channel LRU that Phase 17 enrichment uses, so list and guide never fetch the same data twice.
- [ ] **18.3.7** Overscan short-circuit — skip all recomputation when a scroll stays within the already-materialized overscan.
- [ ] **18.3.8** Bound tripwire — dev-warn when the published cell count exceeds favorites × 40, catching virtualization regressions immediately.
- [ ] **18.3.9** Shift tests — unit test cell-set stability inside the overscan and correct refetch beyond it.
- [ ] **18.3.10** Scroll profile — continuously scroll 3 days with 20 favorites, confirm the frame budget holds, and note the numbers in the phase file.

## Feature 18.4 — Program cell inline detail

Clicking a cell opens one docked detail panel below the grid — never a modal, never stacked. It reads from data already in the window cache, is fully keyboard-reachable, and offers Play when the programme is airing now.

- [ ] **18.4.1** Docked panel — clicking a cell opens a panel below the grid showing title, full time range, duration, description, category, and icon.
- [ ] **18.4.2** Single instance — bind the panel to `setValue('guide.selectedProgram', …)`; selecting another cell replaces content, Escape or Back clears it.
- [ ] **18.4.3** Computed highlight — highlight the selected cell via a `computed()` id comparison over the shared `data-action` delegation — no per-cell listeners.
- [ ] **18.4.4** Zero extra queries — source the detail from the already-fetched window cache; a click performs no storage read.
- [ ] **18.4.5** Deterministic reflow — opening the panel shrinks the grid viewport by one fixed panel-height constant: a single predictable reflow, no measuring, no animation.
- [ ] **18.4.6** Focus contract — Enter on the focused cell opens the panel, Tab reaches its close button, and closing returns focus to the originating cell.
- [ ] **18.4.7** Play when airing — when the selected programme is currently airing, show a Play action that triggers the standard channel-playback handoff for that favorite.
- [ ] **18.4.8** ARIA basics — mark the panel as a labelled region (programme title) and expose selected state on cells, ahead of the fuller Phase 25 accessibility pass.
- [ ] **18.4.9** Selection tests — unit test select, replace, and clear transitions plus the airing-now Play visibility rule.
- [ ] **18.4.10** Stacking smoke — rapidly click many cells and verify a single panel instance with no leaked selection state.

## Feature 18.5 — tvg-id auto-matching pass

Exact tvg-id matching against the Phase 16.8 index is the workhorse: automatic, idempotent, and re-derived from data each session so corrected feeds self-heal. Its report — matched and unmatched counts — is the honest signal of guide quality.

- [ ] **18.5.1** Matching module — implement `autoMatch()` in `src/epg/matching.ts`: resolve `normalizeEpgId(channel.tvgId)` against the channel index for every channel of the active playlist — exact hits only.
- [ ] **18.5.2** Automatic triggers — run the pass after every EPG import summary and after every playlist refresh; it is pure over `(channels, index)` and safe to repeat.
- [ ] **18.5.3** Index-only cost — matching touches only the `epgChannels` index (thousands of entries), never programme data — no scans over hundreds of thousands of rows.
- [ ] **18.5.4** MatchReport — produce `{matched, unmatchedWithTvgId, noTvgId}` and store the counts on the playlist record.
- [ ] **18.5.5** Report surface — render the report in the sources view ("2,143 of 2,400 channels matched to guide data") with unmatched as the entry point into 18.7.
- [ ] **18.5.6** Computed, not stored — auto-match results are never persisted; only manual mappings are — a fixed provider feed heals automatically next session.
- [ ] **18.5.7** One resolver — implement the full precedence in a single `resolveEpgChannel()` (manual mapping → tvg-id exact → none, extended by 18.6) used by the list, the guide, and detail views alike.
- [ ] **18.5.8** Debounced settle — when import chunks and a playlist refresh land together, debounce to one matching run per settle.
- [ ] **18.5.9** Precedence tests — unit test resolution order and the report counts over a mixed fixture playlist.
- [ ] **18.5.10** Match benchmark — assert 90 k channels against a 10 k-entry index completes in < 100 ms (pure Map lookups) and record the measurement.

## Feature 18.6 — Bounded name-based fallback matching

For channels without usable tvg-ids, a second exact pass on normalized names — precomputed into a Map, so it stays O(1) per channel. Fuzzy scanning over 90 k rows is an explicit non-goal: ambiguity means silence, because a wrong guide is worse than none.

- [ ] **18.6.1** Name normalizer — implement `normalizeChannelName()` (lowercase, trim, the ported strip-country-prefix patterns, collapsed whitespace, stripped quality suffixes like HD/FHD/4K).
- [ ] **18.6.2** Precomputed name map — build a Map from normalized EPG display-name → EPG channel id once per index rebuild; per-channel matching stays an O(1) lookup, never a fuzzy scan.
- [ ] **18.6.3** Ambiguity exclusion — names that normalize identically for two EPG channels are excluded from the map and counted; silence beats a wrong match.
- [ ] **18.6.4** Second pass only — run the name pass exclusively over channels the tvg-id pass left unmatched, keeping the added cost proportional to the gap.
- [ ] **18.6.5** Extended report — add `nameMatched` and `ambiguousSkipped` to the MatchReport and its sources-view rendering.
- [ ] **18.6.6** Confidence marker — tag name-based resolutions `matchSource: 'name'` so the mapping dialog can present them as lower-confidence hints.
- [ ] **18.6.7** Final precedence — the single `resolveEpgChannel()` chain becomes manual mapping → tvg-id exact → name exact → none; no other resolution path exists anywhere.
- [ ] **18.6.8** Reviewable patterns — keep the suffix-strip list as a commented constant array in `matching.ts` — one line per pattern, no regex soup.
- [ ] **18.6.9** Normalization tests — cover "TV5 HD" ↔ "tv5", "NL: NPO 1" ↔ "NPO 1", and the ambiguous-name exclusion path.
- [ ] **18.6.10** Combined benchmark — verify both passes together stay < 150 ms on the large fixture and note the number in the phase file.

## Feature 18.7 — Manual mapping dialog

When automation fails, the user fixes it once: a searchable picker over the EPG channel index, with a now/next preview so the choice can be verified before saving, and an explicit "no guide for this channel" escape hatch.

- [ ] **18.7.1** Dialog shell — build `src/epg/mapping-dialog/` as an in-flow overlay (no route change) opened from a channel row's context action "Map guide channel" and from 18.1.7's grid cells.
- [ ] **18.7.2** Searchable list — filter the in-memory `epgChannels` index with a debounced (150 ms) input using the same incremental-filter approach as Phase 09 search.
- [ ] **18.7.3** Status header — show the channel's current resolution (manual / tvg-id / name / unmatched) with the currently resolved EPG channel highlighted in the list.
- [ ] **18.7.4** Instant effect — selecting an entry writes the mapping through a `defineFn` action and immediately republishes the visible window so the row's EPG appears without reload.
- [ ] **18.7.5** Unmap and suppress — offer "Remove mapping" (revert to automatic resolution) and "No guide for this channel" (store an explicit `null` mapping that suppresses auto-matching for that key).
- [ ] **18.7.6** Candidate preview — render now/next for the highlighted candidate via one `epgGetRange` around now, so users verify before committing.
- [ ] **18.7.7** Keyboard flow — ↑/↓ move through results, Enter selects, Escape closes — consistent with the app-wide key map.
- [ ] **18.7.8** Focus discipline — the dialog appears instantly (no animation), moves focus into the search input on open, and restores focus to the invoking element on close.
- [ ] **18.7.9** Size split — keep the dialog ≤ 300 lines per file by separating search/list rendering from action wiring.
- [ ] **18.7.10** Action tests — unit test map, remap, remove, and explicit-null flows plus the immediate-republish hook.

## Feature 18.8 — Mapping persistence

Manual mappings are the user's hand-tuned work and must be indestructible: keyed stably per source (the mapping-key idea ported from thunder-tv, trimmed to ThunderTV's source types), persisted on the full and partial tiers alike, surviving refresh, and exportable.

- [ ] **18.8.1** Stable keys — add an `epgMappings` store keyed `` `${playlistId}:${channel.tvgId || normalizeChannelName(channel.name)}` `` — stable across playlist refresh reindexing.
- [ ] **18.8.2** Record shape — store `{key, epgChannelId | null, offsetMinutes, updatedAt}` per mapping.
- [ ] **18.8.3** Small-valuable-data tier rule — persist mappings on both the full and partial tiers (unlike EPG program bulk data), so a partial-tier device keeps its manual work across reboots.
- [ ] **18.8.4** Boot load — load all mappings into a module-memory Map at boot; `resolveEpgChannel()` reads only that Map, never storage.
- [ ] **18.8.5** Action-layer writes — route every mutation through `defineFn` actions using the §6.3 debounced persistence bridge.
- [ ] **18.8.6** Refresh survival — prove with a test that a playlist re-parse recomputes identical keys and the refreshed channel keeps its mapping.
- [ ] **18.8.7** Export/import seam — serialize mappings for the Phase 22 settings-export JSON now (register with the exporter then); import merges by key with newest-wins.
- [ ] **18.8.8** Garbage collection — deleting a playlist removes all `` `${playlistId}:` ``-prefixed mappings in the same operation.
- [ ] **18.8.9** Tier matrix — run the storage test matrix over the `epgMappings` store on all tiers.
- [ ] **18.8.10** Key-stability tests — unit test keys for tvg-id-present versus name-only channels and the GC on source deletion.

## Feature 18.9 — Per-channel time-offset correction

Some feeds are simply an hour off for some channels. The fix is a ± minutes value stored with the mapping and applied at exactly one read point — the memory cache load — so enrichment, guide cells, and detail all inherit it and no stored row is ever mutated.

- [ ] **18.9.1** Offset control — add a ± minutes stepper to the mapping dialog (range −720…+720, with quick ±30/±60 buttons), stored as `offsetMinutes` on the mapping record.
- [ ] **18.9.2** Single application point — apply the offset only when programs load into the per-channel memory cache (shift `start`/`stop` by `offsetMinutes × 60_000`); every consumer inherits it for free.
- [ ] **18.9.3** Read-time only — never mutate stored program rows; changing an offset never requires a re-import.
- [ ] **18.9.4** Instant apply — an offset change invalidates that channel's cache entry and republishes the window immediately.
- [ ] **18.9.5** Visible badge — show the active offset as a badge in the mapping dialog and as a `title` tooltip on the guide's channel column.
- [ ] **18.9.6** Free persistence — offsets ride the 18.8 mapping record across tiers and refreshes with zero additional storage code.
- [ ] **18.9.7** Input guards — clamp the range, reject `NaN`, and treat `0` as field-absent on the stored record.
- [ ] **18.9.8** Shift test — unit test that a +60 offset moves `nowNext` resolution by exactly one hour against a fixture channel.
- [ ] **18.9.9** Invalidation test — unit test that stale pre-offset rows are never served after an offset change.
- [ ] **18.9.10** Mis-timed-feed smoke — against a deliberately shifted fixture feed, set the correcting offset and verify the guide column and the row progress bar agree.

## Feature 18.10 — Guide keyboard/remote navigation

The guide must be fully drivable with arrows, Enter, and Back — which is simultaneously the LG webOS remote story, since the plan's keyboard-first rule makes TV remotes fall out for free. One roving focus cell, one deterministic back-stack.

- [ ] **18.10.1** Roving focus — implement `src/epg/guide/guide-nav.ts` with a single `tabindex="0"` cell at a time; arrow keys move the roving focus (TV remote = arrow keys, per plan §9).
- [ ] **18.10.2** Spatial movement — ←/→ move to the previous/next programme on the same channel; ↑/↓ move to the temporally overlapping cell on the adjacent favorite row.
- [ ] **18.10.3** Deterministic back-stack — Enter opens the 18.4 detail; Escape/Back closes the detail first, then exits the guide to the previous view — one predictable order.
- [ ] **18.10.4** Focus-driven shifts — moving focus beyond the materialized window reuses the 18.3 shift path and keeps the cell visible with `scrollIntoView({block:'nearest'})` — never smooth scrolling.
- [ ] **18.10.5** Jump keys — Home/End jump the focused row to the now column / window end; `n` triggers jump-to-now.
- [ ] **18.10.6** Focus as state — hold focus in one Spektrum value (`guide.focusedCell {channelId, start}`) so the highlight class is a `computed`, not `classList` juggling.
- [ ] **18.10.7** Republish survival — after a tick or window republish, re-resolve `{channelId, start}` against the new cell set, falling back to the nearest cell when the exact one aged out.
- [ ] **18.10.8** Central key registry — register guide keys with the app-wide keyboard map so bindings activate only while the guide view is active and never double-fire.
- [ ] **18.10.9** Movement tests — unit test same-row prev/next resolution and the cross-row temporal-overlap pick against fixture rows.
- [ ] **18.10.10** Pointer-free pass — complete a full manual run using only the keyboard: reach the guide from the rail, navigate, open detail, map a channel, and exit — zero pointer usage, result noted here.
