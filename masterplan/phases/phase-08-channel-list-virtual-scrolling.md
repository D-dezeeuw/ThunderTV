# Phase 08 — Channel List & Virtual Scrolling

> **Epic goal:** The core browsing surface — a windowed virtual list over 90 000+ channels that keeps ≤ ~40 rows in the DOM at all times, with group navigation, lazy logos, selection, and context actions, all fed from plain module memory per the MASTERPLAN.md §5.4 contract.
> **Verification:** On the built `dist/` with the generated 90 k fixture, scripted scrolling from top to bottom records zero long tasks > 50 ms and never more than ~40 row elements in the DOM; jump-to-group lands on the right row instantly; a reload restores scroll position; `npm run bench:list` passes and its numbers are recorded in this file.

Before this phase, imported playlists sit in storage with nothing to render them — the app can ingest 100 k channels but shows none. After it, `src/ui/` contains the hand-rolled windowing controller (~150 lines per plan §6), the `data-each` slice binding from §6.1, the channel row template with its reserved EPG area, group views driven by the Phase 06 `GroupMeta`, and a validated 90 k scroll performance baseline — the surface Phases 09 (search) and 10 (playback) plug into.

## Feature 08.1 — Windowing controller (fixed row height, spacer divs, rAF-throttled scroll → publishWindow)

The entire virtual list stays trivial because row height is a constant per density mode — no measuring, ever; a small controller owns the scroll math and publishes the visible slice.

- [ ] **08.1.1** Create `src/ui/virtual-list.ts` (~150 lines per plan §6) owning `scrollTop`, `ROW_H`, `OVERSCAN = 8`, `visibleCount`, and the module-level `allRows: ChannelRow[]` array.
- [ ] **08.1.2** Derive `ROW_H` from the density setting — 32 px compact, 44 px comfortable — as the single constant every piece of scroll math shares; heights are never measured from the DOM.
- [ ] **08.1.3** Implement `publishWindow()` exactly per §5.4 — compute the first index from `scrollTop / ROW_H`, slice `first - OVERSCAN` to `first + visibleCount + OVERSCAN`, and write `list.visibleRows`, `list.padTop`, `list.padBottom`.
- [ ] **08.1.4** Throttle scroll through `requestAnimationFrame` per §6.1 — the `data-action="scroll:onListScroll"` handler records `scrollTop` and schedules at most one `publishWindow()` per frame.
- [ ] **08.1.5** Expose `setRows(rows)` as the controller's only data entry point — it swaps `allRows` and republishes; imports, search, group filters, and source switches all call this and nothing else.
- [ ] **08.1.6** Recompute `visibleCount` from viewport height with a `ResizeObserver` on the list container, republishing on resize so window shrinking never leaves blank rows.
- [ ] **08.1.7** Make a density switch exactly one republish — update `ROW_H`, rescale the preserved scroll position proportionally, and publish; no other code paths involved.
- [ ] **08.1.8** Clamp the math at the edges — empty arrays, lists shorter than the viewport, scroll past the end after `setRows` shrank the list, and negative pad values are all impossible by construction.
- [ ] **08.1.9** Extract the pure window math (`firstIndex`, slice bounds, pad heights) into `src/ui/window-math.ts` and unit-test it exhaustively — the controller file stays ≤ 300 lines and the math stays provable.
- [ ] **08.1.10** Add a controller-level spec with a stubbed container asserting one `publishWindow` per animation frame under a scroll-event storm (the rAF throttle actually throttles).

## Feature 08.2 — data-each windowed slice binding (list.visibleRows, padTop/padBottom)

Spektrum reconciles whatever `data-each` is handed — so it is handed only the windowed slice; the full 90 k array never reaches the DOM layer, per plan §2's Spektrum usage rules.

- [ ] **08.2.1** Build the list markup per §6.1 — a `.list` scroll container holding a top `.pad` spacer, one `.rows` container with `data-each="list.visibleRows"`, and a bottom `.pad` spacer.
- [ ] **08.2.2** Bind spacer heights with `:style="'height:' + list.padTop + 'px'"` (and `padBottom` below) so the native scrollbar reflects the full virtual extent.
- [ ] **08.2.3** Confirm total virtual height is safe — 90 k × 44 px ≈ 4 M px sits comfortably under every target browser's element-height limit; note the headroom for larger playlists.
- [ ] **08.2.4** Measure Spektrum's reconciliation on slice replacement — count DOM operations per scroll frame with a MutationObserver in a dev harness, and record whether row-node reuse needs help (stable keys) or works as-is; note the finding.
- [ ] **08.2.5** Keep `setValue('list.visibleRows', slice)` the only array-valued state write in the list path — the slice is ≤ `visibleCount + 2 × OVERSCAN` rows (~40 max) by construction.
- [ ] **08.2.6** Add a guard test that greps templates for `data-each` bindings and asserts none binds a raw channels array — only `list.visibleRows` (and later small view arrays) are legal.
- [ ] **08.2.7** Verify overscan visually and in tests — the published slice contains `OVERSCAN` rows above and below the viewport so fast scrolling shows content, not blank pads.
- [ ] **08.2.8** Publish the initial window after `setRows` using the restored `scrollTop` (fed by Feature 08.6) so a session-restored list paints at its saved position on the first frame.
- [ ] **08.2.9** Add a DOM assertion test — after rendering the 90 k fixture and scrolling to three positions, `document.querySelectorAll('.rows > *').length` is ≤ 40 every time.
- [ ] **08.2.10** Add a programmatic-scroll integration test asserting `list.visibleRows` content matches the expected slice for given `scrollTop` values (window math and binding agree end-to-end).

## Feature 08.3 — Channel row template (logo box, name, EPG area placeholder)

The row is one flex line rendered ~40 times — every byte of its template and every binding in it is hot-path cost, and its layout must already reserve the space EPG will fill in Phase 17.

- [ ] **08.3.1** Write the row template inside the list partial as one flex line — fixed-size logo box, ellipsis-truncated name span, and a right-aligned EPG area — matching the plan §9 row anatomy.
- [ ] **08.3.2** Lock row height to the density constant — 32/44 px with vertically centered content and zero elements that could wrap or grow; the fixed-height promise is what makes the windowing math valid.
- [ ] **08.3.3** Render the channel name through the ported `applyChannelNameStrip(name, settings.stripCountryPrefix)` so the display strip follows the setting without touching stored rows.
- [ ] **08.3.4** Reserve the EPG area as a fixed-width empty placeholder element now — when Phase 17 fills it with now-playing text and a progress bar, no row reflows and no template restructuring happens.
- [ ] **08.3.5** Show a small radio glyph in place of the EPG placeholder when `row.radio` is true — the Feature 06.9 flag's first visible consumer.
- [ ] **08.3.6** Use `{{expr}}` interpolation for text and `:attr` bindings for the logo `src` and row classes — no innerHTML anywhere in the row path.
- [ ] **08.3.7** Style exclusively via `tokens.css` custom properties with both density values expressed as tokens, keeping the row CSS free of magic numbers and free of transitions.
- [ ] **08.3.8** Add light semantic groundwork — `role="listbox"` on the rows container and `role="option"` per row — so the Phase 25 accessibility pass extends rather than retrofits.
- [ ] **08.3.9** Test truncation — a 300-character channel name renders at fixed height with an ellipsis and no horizontal overflow in both density modes.
- [ ] **08.3.10** Keep the row template in the per-view HTML partial per Spektrum usage rules — a test asserts no JS module builds row DOM via string concatenation.

## Feature 08.4 — Lazy logo loading (loading="lazy", fixed-size boxes, broken-image fallback)

Ninety thousand logo URLs of wildly varying quality must cost nothing until visible and never shift layout — the browser's lazy loading does the heavy lifting, the template does the discipline.

- [ ] **08.4.1** Render logos as `<img loading="lazy" decoding="async">` inside the fixed-size logo box with `object-fit: contain` — the box is sized by CSS before any bytes load.
- [ ] **08.4.2** Skip the network entirely for rows without a `logo` value — render the neutral placeholder glyph directly instead of an empty-`src` image that would fire a bogus request.
- [ ] **08.4.3** Handle broken images with one delegated `error` listener on the rows container that swaps the failed `img` for the placeholder glyph — no per-row handlers, no retry loops.
- [ ] **08.4.4** Neutralize the recycled-row hazard — when the slice replaces a row's data, the old logo must not flash on the new channel; clear or rebind `src` atomically with the row content and prove it with a rapid-scroll test.
- [ ] **08.4.5** Set `referrerpolicy="no-referrer"` on logo images — third-party logo hosts get no Pages-URL referrer, and some hotlink-protected hosts behave better without one.
- [ ] **08.4.6** Accept that `http://` logos on the `https://` origin fail silently as mixed content — the fallback glyph covers them; note this as expected behavior rather than a bug to chase.
- [ ] **08.4.7** Verify decode pressure stays bounded — only ~40 imgs exist at once by construction; confirm during the Feature 08.9 scroll runs that image decode never appears in long tasks.
- [ ] **08.4.8** Keep the placeholder glyph instant — an inline SVG or character styled from tokens, no image request, no CSS transition on the swap.
- [ ] **08.4.9** Test the fallback path with a fixture of guaranteed-404 logo URLs asserting every affected row shows the glyph and the DOM contains no broken-image icons.
- [ ] **08.4.10** Test the no-logo path asserting zero `img` elements (not hidden ones) are created for logo-less rows.

## Feature 08.5 — Group view (group headers, jump-to-group, chunked group expansion)

Groups are the primary structure of big playlists; the Phase 06 `GroupMeta` (counts + first-index) makes the group view render instantly from metadata, without ever scanning the channel array.

- [ ] **08.5.1** Build a groups panel listing every `GroupMeta` (name + count) straight from the `groups` store — it renders before channel rows are even in memory, since it needs none of them.
- [ ] **08.5.2** Implement jump-to-group in the full list — clicking a group sets `scrollTop = firstIndex × ROW_H` and republishes; landing is exact because heights are fixed.
- [ ] **08.5.3** Implement group expansion as a filtered list — expanding a group calls `setRows` with only that group's rows, reusing the entire windowing/binding stack unchanged (chunked expansion means the window, ~40 rows, is all the DOM ever pays).
- [ ] **08.5.4** Build per-group row index arrays lazily on first expansion and cache them in module memory keyed by group name — non-contiguous groups (Feature 06.6's interleaved case) filter correctly without assuming sorted playlists.
- [ ] **08.5.5** Keep view switching cheap — "All channels" ↔ group view is a `setRows` swap plus a `ui.activeGroup` state write; DOM row count never exceeds ~40 in either direction.
- [ ] **08.5.6** Display the `Ungrouped` bucket last, matching the worker's group ordering, and hide the groups panel entirely for single-group playlists (nothing to navigate).
- [ ] **08.5.7** Store `ui.activeGroup` in Spektrum state per source, feeding Feature 08.6's persistence so a reload reopens the same group.
- [ ] **08.5.8** Make the groups panel keyboard-navigable — ↑/↓ moves through groups, Enter expands, Backspace/← returns to all channels — the same physical keys a TV remote produces.
- [ ] **08.5.9** Stress the panel with the 10 000-group cap fixture from Feature 06.6 — the groups panel itself windows or paginates if needed so pathological playlists cannot flood the DOM either.
- [ ] **08.5.10** Measure expansion latency — expanding a 20 k-row group must publish its first window in ≤ one frame; add the measurement to the Feature 08.9 protocol run.

## Feature 08.6 — Scroll position persistence per source (via state/ui + persistence bridge)

Coming back to a playlist should feel like never having left — scroll position, view mode, and active group per source survive reloads through the Phase 05 persistence bridge, without recording scroll spam in history.

- [ ] **08.6.1** Model per-source list state in a `state/ui` module — a map keyed by source id holding `scrollTop`, `viewMode` (`all | groups`), and `activeGroup` — small enough to be recordable state.
- [ ] **08.6.2** Persist through the action layer per §6.3 — a `defineFn` action updates the map and calls `persist('ui.listState')`, debounced by the bridge's 500 ms batch; scroll frames themselves never write storage.
- [ ] **08.6.3** Capture `scrollTop` on settle, not on every frame — an idle debounce (~300 ms after the last scroll event) samples the position once, keeping both history and the persistence bridge quiet (§5.8).
- [ ] **08.6.4** Restore before first paint — the boot order from §6.4 rehydrates `ui.listState` with the other saved keys, so the initial `publishWindow` after `setRows` uses the saved offset directly (no visible jump from top).
- [ ] **08.6.5** Clamp restored positions — if a refresh shrank the playlist below the saved offset, clamp to the new maximum instead of publishing an empty window.
- [ ] **08.6.6** Track all-channels and group-expansion scroll positions separately per source, so toggling views round-trips both positions faithfully.
- [ ] **08.6.7** Cap the map at the last 20 sources (LRU) so the serialized state stays localStorage-friendly on the partial tier.
- [ ] **08.6.8** Restore `activeGroup` alongside scroll — a reload inside an expanded group reopens that group's filtered rows, then applies its saved offset.
- [ ] **08.6.9** Round-trip test through the memory adapter's `simulateReload()` — save, reload, assert identical `scrollTop`, `viewMode`, and `activeGroup` per source, plus the clamp case.
- [ ] **08.6.10** Manual smoke on built `dist/` — scroll deep into the 90 k fixture, reload, verify the same rows are visible within one frame of the list painting; record in this file.

## Feature 08.7 — Row selection and active-channel highlight

Selection (where the keyboard is) and the active channel (what is playing) are distinct states with distinct highlights — decoupling them now is what makes browse-while-playing work in Phase 10 without rework.

- [ ] **08.7.1** Dispatch row clicks through one delegated `data-action` on the rows container that reads the row's channel id — no per-row listeners in a windowed list.
- [ ] **08.7.2** Store `list.selectedId` via a `defineFn('selectChannel')` action; rows derive a `selected` class by comparing their id — id-based, so selection survives scrolling out of and back into the window.
- [ ] **08.7.3** Keep `player.active` (the playing channel, owned by Phase 10's state) visually distinct from selection — two classes, two tokens, both instant, and a row can carry both.
- [ ] **08.7.4** Move selection with ↑/↓ over the current row order (filtered or full), scrolling the window to keep the selection visible — selection drives scroll, not vice versa.
- [ ] **08.7.5** Wire Enter on the selected row to a `setActiveChannel` action stub — the full §6.3-shaped action body (zap history, persistence) lands in Phase 10; the dispatch path exists and is tested now.
- [ ] **08.7.6** Reserve double-click explicitly as a no-op for Phase 12's theater mode — a comment plus a test asserting double-click does not double-fire selection or the play stub; note the reservation.
- [ ] **08.7.7** Verify selection cost — moving selection re-renders at most the two affected rows (old and new), confirmed by the reconciliation instrumentation from Feature 08.2.
- [ ] **08.7.8** Persist `selectedId` per source in the Feature 08.6 map so reload restores the keyboard position along with the scroll offset.
- [ ] **08.7.9** Handle selection invalidation — when `setRows` produces a set without the selected id (filter, refresh), clear selection to the first visible row rather than pointing at nothing.
- [ ] **08.7.10** Test the selection semantics end-to-end — click, arrow-move across a window boundary, filter-invalidate, and reload-restore all assert the right `selectedId` and exactly one highlighted row.

## Feature 08.8 — Context actions (right-click/long-press favorite toggle)

Plan §9 puts the favorite toggle on right-click and long-press — the first write path into the denormalized favorites snapshots that Phase 13 builds views on, so the snapshot shape must be right from the start.

- [ ] **08.8.1** Handle `contextmenu` on the rows container through one delegated handler that resolves the row's channel and suppresses the native menu only on actual rows.
- [ ] **08.8.2** Implement long-press for touch and TV pointers — a shared `src/ui/long-press.ts` util (pointerdown + ~500 ms timer, cancelled by move/up) dispatching the same action as right-click.
- [ ] **08.8.3** Write favorites as denormalized snapshots per plan §5 — `{ id, name, url, logo, group, sourceId, addedAt }` — into the `favorites` store, so a favorite renders and plays even when its playlist is not loaded.
- [ ] **08.8.4** Keep a compact `favorites.ids` lookup (id → true map) in Spektrum state for O(1) row-badge derivation; the full snapshot rows live in storage and module memory only.
- [ ] **08.8.5** Render a star indicator on favorited rows derived from the ids map — instant toggle feedback with no animation and no extra row height.
- [ ] **08.8.6** Route the toggle through a `defineFn('toggleFavorite')` action that updates the ids map, writes/deletes the snapshot, and schedules `persist('favorites')` via the §6.3 bridge.
- [ ] **08.8.7** Bind the `f` key to toggle the favorite on the current selection, per the plan §9 keyboard map.
- [ ] **08.8.8** Make the toggle idempotent and race-safe — a double-fire (long-press followed by a stray contextmenu) results in one state change, proven by a test.
- [ ] **08.8.9** Verify snapshot correctness in a spec — toggling a row captures exactly the denormalized fields, and un-favoriting removes the snapshot without touching channel rows.
- [ ] **08.8.10** Run the favorites write path through the storage matrix — on the partial tier, snapshots persist in localStorage and survive `simulateReload()` while channel rows do not (the plan's fast-path promise).

## Feature 08.9 — 90 k-row scroll performance validation (frame-time protocol, DOM row count assertion)

"No dropped frames at 90 k" is the phase's headline claim — this feature turns it into a scripted, repeatable measurement protocol whose numbers are recorded, not asserted from vibes.

- [ ] **08.9.1** Generate the 90 k fixture with `scripts/gen-m3u-fixture.mjs` (seeded, from Feature 06.10) and load it through the real import pipeline so the measurement covers production-shaped rows.
- [ ] **08.9.2** Build the frame-time protocol — a `PerformanceObserver('longtask')` plus rAF-delta sampling wrapped in a small harness that reports p50/p95 frame time and long-task count for a scripted scroll.
- [ ] **08.9.3** Script the scroll in Playwright — ramp `scrollTop` from 0 to max over ~10 s in realistic increments (wheel-sized steps, then flings), against the built `dist/`, never the dev server.
- [ ] **08.9.4** Assert the DOM bound continuously — sample `.rows` child count at every measurement tick and fail the run if it ever exceeds the ~40-row ceiling.
- [ ] **08.9.5** Gate on long tasks — zero tasks > 50 ms during steady-state scrolling; report p95 rAF delta as an informational number with 16.7 ms as the aspirational line.
- [ ] **08.9.6** Run the protocol twice, logos enabled and disabled, to isolate list cost from image cost — if the delta is material, revisit Feature 08.4's decode findings.
- [ ] **08.9.7** Check for node leaks — after 10 000 scroll events, heap-snapshot detached-node counts must be flat, proving Spektrum's slice reconciliation is not accreting orphan rows.
- [ ] **08.9.8** Repeat the run with 4× CPU throttling as the TV-hardware stand-in and record both result sets — webOS viability (plan milestone M7) starts with this number.
- [ ] **08.9.9** Record all results as a decision-note table in this phase file — the baseline Phase 26's performance hardening diffs against.
- [ ] **08.9.10** Package the protocol as `npm run bench:list` so any later phase touching the list re-runs the identical measurement with one command.

## Feature 08.10 — List↔state integration contract (plain-array module memory feeds the window; full array never in Spektrum state)

The §5.4 rule — full array in module memory, only the window in Spektrum — is the load-bearing wall of the whole UI; this feature writes it down, wires the boot path through it, and fences it with tests so no later phase can erode it.

- [ ] **08.10.1** Codify the contract in JSDoc on `setRows`/`publishWindow` — module memory is the query layer, Spektrum carries only `list.visibleRows`, `list.padTop`, `list.padBottom` and scalar list state; every future consumer reads this doc at the call site.
- [ ] **08.10.2** Implement `loadActiveSource()` per the §6.4 boot order — storage streams the active playlist's rows into the module array, then `setRows` publishes; it runs after `run()` so the shell (and restored session state) painted first.
- [ ] **08.10.3** Stream boot loading in chunks — read the `channels` store in `[playlistId, index]` ranges of `CHUNK` rows, publishing the first window as soon as the rows covering the restored scroll position exist, then back-filling the rest.
- [ ] **08.10.4** Make `setRows` the single choke point — Phase 09's search and group filters will call it with filtered arrays; assert no other module writes `list.visibleRows` directly (grep-test the codebase).
- [ ] **08.10.5** Enforce the §5.8 bulk-data rule mechanically — a test helper wraps `setValue` in dev and throws on any array value > 1 000 items, catching contract violations the moment they are written.
- [ ] **08.10.6** Define source-switch semantics — swapping sources replaces the module array, restores that source's persisted list state (or top), and performs exactly one republish; no transient render of the old source's rows.
- [ ] **08.10.7** Bound memory to one active playlist — switching sources drops the previous array before loading the next (the plan §11 mitigation for 100 MB playlists); verify with heap measurements across three switches.
- [ ] **08.10.8** Write the contract unit test — `setRows` with a 90 k array performs exactly three Spektrum writes (`visibleRows`, `padTop`, `padBottom`) and zero writes proportional to row count.
- [ ] **08.10.9** Measure the cold-start budget — cached 90 k playlist on the full tier, reload to interactive channel list in < 1 s per MASTERPLAN.md §3, measured on the built `dist/` and recorded here.
- [ ] **08.10.10** Verify the restored-session render order — the Phase 05 session snapshot (last channel, favorites) is visible before `loadActiveSource()` finishes streaming, matching §6.4's "renders immediately, list streams in behind" promise.
