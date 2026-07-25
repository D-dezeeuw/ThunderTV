# Phase 13 — Favorites & Recent

> **Epic goal:** Make favorites and watch history first-class, denormalized snapshots that survive on every storage tier and turn boot into an instantly usable, playable surface — the fast path on constrained devices.
> **Verification:** Star and `f`-key toggles apply optimistically and survive reload on both the full and partial tiers; recent caps at 100 with consecutive dedupe proven by tests; with IndexedDB blocked and the network blocked entirely, a reload still boots to a rendered, clickable favorites view whose rows play from their snapshots before any playlist parse; a refresh that drops a favorited channel orphan-marks it (dimmed, still playable) and its reappearance un-orphans it; the full tier-matrix unit suite (13.10) is green in `npm test`.

Before this phase, playback (Phases 10–12) works but every session starts from the raw channel list, and nothing the user cares about is marked or remembered beyond the §6.4 last-channel snapshot. After this phase, `src/state/favorites/` owns denormalized `FavoriteEntry`/`RecentEntry` snapshots that render and play without their parent playlist, the rail's Favorites and Recent views reuse the virtual list, toggles work from rows and the `f` key, entries survive the localStorage partial tier, manual ordering and refresh-time reconciliation keep the data honest, and the boot sequence renders favorites playable before any playlist work begins.

## Feature 13.1 — Denormalized snapshot model (FavoriteEntry/RecentEntry with name, url, logo, group, sourceId)

The whole phase rests on one decision: favorites and recent are copies, not references. An entry carries everything needed to render a row and start playback with zero dependency on the 90 k-row parent array.

- [ ] **13.1.1** Create `src/state/favorites/model.ts` — `FavoriteEntry` and `RecentEntry` types carrying `{ id, name, url, logo, group, sourceId }` plus `addedAt`/`order` (favorite) and `playedAt` (recent).
- [ ] **13.1.2** Define stable channel identity in one helper `channelIdentity(ch)` — `tvg-id` when present, else a normalized hash of the stream URL — shared by favorites, recent, and the Phase 15 refresh diff.
- [ ] **13.1.3** Add `snapshotFromChannel(ch, sourceId)` as the only constructor of entries, copying exactly the denormalized fields — no references into the in-memory channel array.
- [ ] **13.1.4** Version the persisted envelope with a `schemaVersion` field so a future shape change migrates instead of discarding user data.
- [ ] **13.1.5** Include an `orphaned?: boolean` flag on `FavoriteEntry` now — 13.8 reconciliation sets it, but the model owns the shape from day one.
- [ ] **13.1.6** Bound entry size at snapshot time — cap name/logo/group string lengths so the whole set fits the partial tier's few-KB budget comfortably.
- [ ] **13.1.7** Keep the raw stream `url` verbatim (playability is the contract) and document that snapshot URLs may embed credentials, binding entries to the same redaction rules as player logs.
- [ ] **13.1.8** Keep the module type-only with pure helpers and zero platform imports — usable from tests, workers, and `src/core/` alike, trivially under the 300-line budget.
- [ ] **13.1.9** Unit-test `channelIdentity`: `tvg-id` preferred, URL-hash fallback stable across runs, and no collisions across a corpus of distinct URLs.
- [ ] **13.1.10** Unit-test that `snapshotFromChannel` copies by value — mutating the source row afterward must not change the entry.

## Feature 13.2 — Favorite toggle interactions (row context action + f key, optimistic update)

Starring must feel free: the state flips synchronously, the storage write debounces behind it, and both the pointer path (row context action) and the keyboard path (`f`) resolve to the same idempotent action.

- [ ] **13.2.1** Implement `defineFn('toggleFavorite', row)` in `src/state/favorites/actions.ts` — add a snapshot or remove by identity, then call `persist('favorites')` inside the same action (§6.3).
- [ ] **13.2.2** Make the update optimistic: the Spektrum value changes synchronously before the debounced storage write — the star flips instantly even on slow tiers.
- [ ] **13.2.3** Add the row context action — right-click / long-press on a channel row opens the minimal context affordance with an add/remove favorite entry per plan §9, appearing instantly with no animation.
- [ ] **13.2.4** Replace the Phase 12.9 `f`-key stub with the real action — `f` toggles the focused list row, or the playing channel when the player has focus, via one target-resolution helper.
- [ ] **13.2.5** Mark favorite state on rows by enriching the visible slice with `isFavorite` at window-publish time from an identity `Set` — never a per-row `computed()` over the full array.
- [ ] **13.2.6** Handle toggling from inside the favorites view: removal republishes the windowed slice without leaving a hole — slice republish, not DOM surgery.
- [ ] **13.2.7** Make the toggle idempotent by identity so key-repeat double-fires can never create duplicate entries.
- [ ] **13.2.8** Append new favorites at the end of the manual order (13.7) with the next `order` value.
- [ ] **13.2.9** Unit-test the add/remove round-trip, identity dedupe, and that `persist` is scheduled exactly once per toggle.
- [ ] **13.2.10** Manual smoke: star one channel via right-click and another via `f`, reload — both survive on the full tier.

## Feature 13.3 — Favorites view (rail entry, reuses the virtual list)

Favorites get a dedicated view behind the rail icon that is deliberately boring: the same virtual list, the same row template, a different row source — and rows that play even when no playlist has loaded.

- [ ] **13.3.1** Add the `#/favorites` route behind the existing rail icon — view module `src/ui/views/favorites.ts` mounting the shared virtual-list controller with the favorites array as its row source.
- [ ] **13.3.2** Reuse the standard channel-row template — logo/name/group render from the snapshot; Phase 17 EPG affordances will attach through the same identity with no template fork.
- [ ] **13.3.3** Play favorites through the normal engine-host path using the snapshot `url` — fully functional before any playlist has loaded or parsed.
- [ ] **13.3.4** Scope Phase 9 search to the active view's row source so the search box filters within favorites when the view is open.
- [ ] **13.3.5** Render orphaned entries (13.8) dimmed with a strings-module hint ("No longer in its playlist") while keeping them clickable — the URL may still work.
- [ ] **13.3.6** Add the empty state: a centered strings-module message pointing at the `f` shortcut, consistent with the Phase 2 empty-state pattern.
- [ ] **13.3.7** Render purely from state — no storage reads on navigation; the 13.9 boot hydration already placed favorites in memory.
- [ ] **13.3.8** Keep the view file ≤300 lines by reusing the list controller and row partial — the view is wiring only.
- [ ] **13.3.9** Unit-test row-source switching: navigating list→favorites→list republishes the correct slices with no stale rows from the previous source.
- [ ] **13.3.10** Manual smoke on the partial tier: fresh reload, open favorites, and play an entry before the active source has finished re-parsing.

## Feature 13.4 — Recent tracking (playback start events append, cap 100, dedupe consecutive)

History records what actually played: entries append only when a session truly reaches `playing`, consecutive repeats collapse, recovery restarts don't double-log, and the list never grows past 100.

- [ ] **13.4.1** Record on confirmed playback only — the engine host emits a session-started event when status first reaches `playing`, and `defineFn('recordRecent')` appends the snapshot; failed attempts and abandoned zaps never pollute history.
- [ ] **13.4.2** Dedupe consecutive: replaying the current head updates its `playedAt` instead of appending — no A,A,A runs from pause/resume cycles.
- [ ] **13.4.3** Enforce the cap of 100 inside the action — appending beyond the cap drops the oldest entry; the constant lives in the model module.
- [ ] **13.4.4** Move re-played older entries to the head (remove + re-append) so ordering reflects actual recency.
- [ ] **13.4.5** Call `persist('recent')` inside the action so the §6.3 debounce turns a zap spree into a single storage write.
- [ ] **13.4.6** Build entries exclusively via `snapshotFromChannel` — identical playability contract as favorites, including the Phase 14.5 session-only caveat for ephemeral sources.
- [ ] **13.4.7** Verify the 12.5 zap-coalescing interaction: only the committed zap target ever reaches `playing`, so skimmed channels never enter recent.
- [ ] **13.4.8** Guard with a per-session id so 11.2 recovery re-entering `playing` mid-session is not recorded as a new play.
- [ ] **13.4.9** Unit-test the cap, consecutive dedupe, move-to-head, and the recovery no-double-record guard with a scripted status sequence.
- [ ] **13.4.10** Manual smoke: zap through 8 channels with two pause/resume cycles — recent shows 8 unique entries in play order, newest first.

## Feature 13.5 — Recent view (reverse-chronological, relative timestamps)

The Recent view is a flat, newest-first list with human timestamps that advance on the global tick — no per-row timers, no section headers, no ceremony.

- [ ] **13.5.1** Add the `#/recent` route behind the rail icon — the shared virtual-list controller with the recent array reversed to newest-first at publish time.
- [ ] **13.5.2** Implement `formatRelative()` ("just now", "5 min", "2 h", "3 d") as one helper beside the strings module — English-only now, locale-ready by construction.
- [ ] **13.5.3** Re-derive timestamps on the global 30 s tick only (§5.5) — a `computed()` on `epg.tick` refreshes visible labels; zero per-row timers.
- [ ] **13.5.4** Reuse the channel-row partial with the timestamp in the secondary slot; clicking plays from the snapshot exactly like favorites.
- [ ] **13.5.5** Add a "Clear history" action in the view header — wipes recent state and persists the empty list behind a plain static confirm.
- [ ] **13.5.6** Keep the list flat — no day headers or grouping; reverse-chronological order plus relative times carry the information, per minimal-by-default.
- [ ] **13.5.7** Scope search within the recent view through the same 13.3.4 mechanism — no special cases.
- [ ] **13.5.8** Keep entries from deleted sources (15.2) rendered and playable from their snapshots — denormalization is the point; show the orphan hint only where 13.8 marked it.
- [ ] **13.5.9** Unit-test `formatRelative` boundaries (59 s, 61 s, 24 h, 7 d) and the tick-driven label refresh.
- [ ] **13.5.10** Manual smoke: play three channels, wait one tick — labels advance with no interaction and no layout shift.

## Feature 13.6 — Cross-tier survival (favorites/recent always persisted on partial tier via localStorage)

Favorites and recent are exactly the "small, valuable data" the partial tier exists for. They persist identically on full and partial tiers, degrade gracefully under quota, and rehydrate defensively.

- [ ] **13.6.1** Declare `favorites` and `recent` as small-valuable keys in the StorageAdapter contract — persisted on the full tier (IDB stores) and the partial tier (localStorage) alike; only the none tier keeps them session-scoped.
- [ ] **13.6.2** Route partial-tier writes through the §5.7 guarded set — a `QuotaExceededError` demotes the session with the one-line storage notice, never throwing into a toggle.
- [ ] **13.6.3** Serialize each key as one JSON document with the 13.1.4 `schemaVersion` envelope, and assert in tests that a full set serializes under ~64 KB — no chunking needed at capped sizes.
- [ ] **13.6.4** Hydrate both keys in the single boot `getMany` batch (§6.4) on every tier — no tier-specific hydration code paths.
- [ ] **13.6.5** Handle mid-session tier demotion (the plan's §11 runtime-IDB-failure risk): subsequent favorite/recent writes retarget the demoted tier with no data-model changes.
- [ ] **13.6.6** Rehydrate corrupt or version-mismatched payloads as an empty list plus a diagnostics entry — never a boot crash; the app is always fully functional.
- [ ] **13.6.7** Keep the memory-tier adapter the reference implementation — favorites/recent behavior must be observably identical across tiers except for reload survival (§6.2).
- [ ] **13.6.8** Document the partial-tier budget split in `src/core/storage/` — favorites/recent share the ~5 MB localStorage budget with settings and source definitions; record the allocation.
- [ ] **13.6.9** Unit-test the quota path: a throwing localStorage mock demotes gracefully while the in-memory value stays intact and usable.
- [ ] **13.6.10** Manual matrix smoke: block IDB in the browser profile, star channels, reload — favorites and recent present and playable on the partial tier.

## Feature 13.7 — Manual favorites ordering (move up/down, persisted order)

Favorites are a curated list, so the user owns the order: simple move up/down from pointer and keyboard, one sort site, one persisted `order` field — and recency never touches it.

- [ ] **13.7.1** Add move-up/move-down affordances to favorites-view rows dispatching `defineFn('moveFavorite', id, dir)`.
- [ ] **13.7.2** Swap `order` values with the neighbor inside the action and republish the window — state array order always mirrors the `order` sort, computed at exactly one site.
- [ ] **13.7.3** Persist in the same action via `persist('favorites')` so a reorder spree debounces into one write like every other mutation.
- [ ] **13.7.4** Add the keyboard path — Alt+ArrowUp/Down moves the focused favorites row, registered in the 12.9 keymap table scoped `when: favoritesView`.
- [ ] **13.7.5** Treat boundary moves (first up, last down) as silent no-ops — no wraparound for manual ordering.
- [ ] **13.7.6** Assign `max(order)+1` to appended entries (13.2.8) and tolerate deletion gaps — orders are relative, with compaction on load only when drift exceeds a bound.
- [ ] **13.7.7** Keep recent explicitly non-orderable — recency owns that list; the move affordances render only in the favorites view.
- [ ] **13.7.8** Guarantee ordering survives 13.8 reconciliation — re-linking updates snapshot fields, never `order`.
- [ ] **13.7.9** Unit-test boundary moves, the order persistence round-trip, and append-order for newly starred channels.
- [ ] **13.7.10** Manual smoke: reorder five favorites, reload on the partial tier — order intact.

## Feature 13.8 — Stale-favorite reconciliation (playlist refresh re-links snapshots by stable channel identity, orphan marking)

Providers rename channels and rotate URLs. Refresh-time reconciliation keeps snapshots current when identity survives, marks orphans when it doesn't — and never deletes the user's list on the provider's behalf.

- [ ] **13.8.1** Implement `reconcileFavorites(sourceId, identitySet, rowsByIdentity)` in `src/state/favorites/reconcile.ts` — invoked by the Phase 15 refresh pipeline after a source's chunked write completes.
- [ ] **13.8.2** Build the identity set during the refresh's existing chunked pass (one `channelIdentity` call per row) — never a second full scan of the 90 k array.
- [ ] **13.8.3** Re-link matches: entries whose identity is present get name/logo/url/group refreshed from the new row — snapshots track the provider without losing denormalization.
- [ ] **13.8.4** Orphan-mark: entries with the refreshed `sourceId` whose identity disappeared get `orphaned: true` — never auto-deleted; the user's list is the user's.
- [ ] **13.8.5** Un-orphan on return: a later refresh containing the identity clears the flag and re-links in the same pass.
- [ ] **13.8.6** Reconcile recent entries with the same helper but re-link only — orphan marking applies to favorites; recent ages out naturally at cap 100.
- [ ] **13.8.7** Persist once at the end of the pass (`persist('favorites')`) — one debounced write for the whole reconciliation, not per entry.
- [ ] **13.8.8** Hook source deletion (15.2) into the mass-orphan path for every entry with that `sourceId` — a cross-phase contract documented in both phase files.
- [ ] **13.8.9** Unit-test: a rename (same `tvg-id`, new name) re-links; removal orphans; reappearance un-orphans; `order` untouched throughout (13.7.8).
- [ ] **13.8.10** Manual smoke: refresh a playlist edited to drop a favorited channel — the row dims with the orphan hint and still attempts playback.

## Feature 13.9 — Favorites-first boot fast path (render + playable before any playlist parse, per MASTERPLAN.md §6.4)

Boot renders what matters first: one storage batch hydrates favorites, recent, and the last channel into Spektrum state before `run()`, and the heavy playlist path streams in behind an already-usable app.

- [ ] **13.9.1** Enforce the §6.4 boot order in `src/main.ts`: `createStorage()` → one `getMany(['settings','favorites','recent','player.active','player.zapHistory'])` → `setValue` loop → `run()` — favorites are in the DOM before any playlist work.
- [ ] **13.9.2** Fire `loadActiveSource()` after `run()` and never await it on the render path — a slow or failing re-parse cannot delay first paint.
- [ ] **13.9.3** Land on the favorites view when the partial tier must re-parse the active source — the plan's "favorites become the fast path on constrained devices" made concrete, with a decision note.
- [ ] **13.9.4** Guarantee boot-snapshot rows are immediately playable — the engine host consumes the snapshot `url` with zero dependency on the channels array.
- [ ] **13.9.5** Bound the boot batch: measure the fast-path `getMany` payload, keep its parse in single-digit milliseconds, and record the measured size in the notes.
- [ ] **13.9.6** Share one storage round-trip: the Phase 5 `player.active` restore and this phase's hydration ride the same `getMany` batch — exactly one read before `run()`.
- [ ] **13.9.7** Instrument `performance.mark('boot:interactive')` after `run()` so the cold-start <1 s budget is measured, not assumed.
- [ ] **13.9.8** Isolate failure: a rejected `getMany` falls through to the empty state and boots anyway — the fast path may degrade, never block.
- [ ] **13.9.9** Script the constrained-device check: with storage seeded and the network blocked entirely, boot reaches a rendered, clickable favorites view (Playwright or a documented manual script).
- [ ] **13.9.10** Record measured boot timings — full and partial tier, cached playlist and blocked network — as decision notes in this phase file.

## Feature 13.10 — Favorites/recent unit tests across tiers (including orphan and cap behavior)

One parameterized harness runs every behavioral suite against all three storage tiers, locking in the phase's guarantees — caps, dedupe, orphans, ordering, quota, and the boot fast path — as regression tests.

- [ ] **13.10.1** Stand up a shared tier-matrix harness — every suite in this feature runs against the IDB (fake-indexeddb), localStorage (jsdom), and memory adapters via one parameterized `describe.each`.
- [ ] **13.10.2** Toggle-semantics suite: add/remove, idempotence, and optimistic-then-persisted timing, per tier.
- [ ] **13.10.3** Cap-behavior suite: recent at exactly 100, oldest evicted, and move-to-head interplay at the cap boundary.
- [ ] **13.10.4** Consecutive-dedupe suite: pause/resume, recovery re-entry, and zap-coalescing scenarios produce zero duplicates.
- [ ] **13.10.5** Orphan-lifecycle suite: mark → still-listed → un-orphan, plus the source-delete mass-orphan path.
- [ ] **13.10.6** Ordering suite: boundary moves, persistence round-trip, and reconciliation non-interference with `order`.
- [ ] **13.10.7** Quota/corruption suite: a quota-throw demotes gracefully; corrupt JSON and a wrong `schemaVersion` rehydrate empty without throwing.
- [ ] **13.10.8** Boot fast-path suite: seeded storage boots and renders favorites before a deliberately delayed `loadActiveSource` resolves, under fake timers.
- [ ] **13.10.9** Size-bound suite: 100 favorites plus 100 recent serialize under the 13.6.3 budget even with hostile long strings, proving the model's caps.
- [ ] **13.10.10** Wire every suite into `npm test` and confirm the standing checklist stays green — no previously passing phase suite broken.
