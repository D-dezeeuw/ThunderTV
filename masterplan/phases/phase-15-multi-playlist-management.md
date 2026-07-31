# Phase 15 — Multi-Playlist Management

> **Epic goal:** Sources become first-class managed objects: a sources view with counts, badges, and refresh age; rename and delete with clean cascades; refresh through the worker with conditional GET where `304` skips the whole parse; a staleness policy; per-source EPG association; instant active-source switching; and honest per-source health and storage accounting.
> **Verification:** On the built `dist/`, refreshing an ETag-honoring URL twice takes the `304` fast path the second time (worker parse provably skipped, completion in milliseconds); a playlist edited to add 2 and drop 1 channel shows `+2 / −1 / ~0` and runs favorites reconciliation exactly once; deleting a 90 k-channel source cascades without freezing the UI and orphan-marks its favorites; switching between two 50 k+ sources restores scroll and search per source in under a second with playback uninterrupted; dead-URL, auth-failed, and CORS-blocked sources show three distinct classified badges with working retries; the diff-math, conditional-GET, cascade, and switching unit suites are green in `npm test`.
> **Status:** `partial` · tracker: `not-maintained` — The Sources view, per-source hiding (`hidden-sources.ts`), manual refresh (`settings/refreshChannels`, `xtream-refresh.ts`), active-source switching and per-source EPG association all ship. **Not built:** conditional GET on playlist refresh (15.4) — the ETag/304 pattern exists in `src/codex/library.ts` and `src/epg/feed-fetch.ts` but was never applied to playlists; the staleness auto-refresh setting (15.5); and the added/removed/changed refresh diff (15.6).

Before this phase, multiple sources can exist (Phase 7 imports, Phase 14 connect upserts) but only as rows in storage — there is no place to see, rename, refresh, or delete them, and switching between them is undefined. After this phase, the rail's Sources view lists every playlist with counts, type badges, age, health, and storage footprint; `src/m3u/refresh.ts` drives fetch → worker re-parse → chunked writes with ETag/If-None-Match conditional GET (masterplan §6.6) and an added/removed/changed diff feeding Phase 13.8 reconciliation; sources carry an EPG URL for Phase 16 to consume; and activating a source swaps the in-memory query layer with per-source scroll and search state restored.

## Feature 15.1 — Sources view (list of playlists with counts, type badges, last-refresh age)

The management home: every source on one screen with the facts that matter — what it is, how big it is, and how fresh it is — reading entirely from persisted meta so the view opens instantly.

- [ ] **15.1.1** Add the `#/sources` route behind the rail's Sources icon — view module `src/ui/views/sources.ts` rendering the sources collection with a plain `data-each` (dozens of rows at most; no windowing, decision-noted).
- [ ] **15.1.2** Compose the row: name, type badge (`m3u-url` / `m3u-file` / `m3u-text` / `xtream`), channel and group counts, last-refresh age — one flex line, fixed badge widths, ellipsis on names.
- [ ] **15.1.3** Render last-refresh age relatively ("12 min ago") via the 13.5 `formatRelative` helper, re-derived on the global 30 s tick — no per-row timers (§5.5).
- [ ] **15.1.4** Mark the active source visually and make row click activate it (15.8) — switching is the primary interaction; everything else sits behind explicit affordances.
- [ ] **15.1.5** Add the per-row action cluster — refresh (15.3), rename/delete (15.2), copy bookmark link (14.6), EPG URL (15.7) — with strings-module labels and no hover-only reveal, keeping hit targets TV-friendly.
- [ ] **15.1.6** Read counts from source meta persisted at import/refresh time (the Phase 6 parse summary) — never by counting the channels store at render time; the view opens instantly.
- [ ] **15.1.7** Route the empty state to the first-run import card — the Phase 7 flow stays one click away when no sources exist.
- [ ] **15.1.8** Carry all source states in one row template — the 14.5 session-only badge and the 15.9 health badge render inline without template forks.
- [ ] **15.1.9** Unit-test the row view-model builder: badges, counts, relative age, active marking, and the ephemeral and health variants.
- [ ] **15.1.10** Manual smoke: three mixed-type sources render correctly on the built `dist/` at compact density with zero layout shift as ages tick over.

## Feature 15.2 — Rename and delete flows (delete cascades rows + orphan-marks favorites)

Renaming is trivial; deleting is not. A delete must remove bulk rows in bounded chunks, keep a crash recoverable, hand favorites to the orphan contract — and never freeze the UI on a 90 k-row source.

- [ ] **15.2.1** Implement inline rename: the name becomes a `data-model`-bound input on the rename action, committing on Enter/blur and cancelling on Esc — an instant swap, no animation.
- [ ] **15.2.2** Persist renames through `defineFn('renameSource')`, updating the StorageAdapter row and the in-state collection together — no drift between store and state.
- [ ] **15.2.3** Build the delete confirm as minimal static UI (native `confirm()` or a plain dialog — decide and note) stating exactly what goes: cached channels, groups, and refresh metadata; favorites survive as orphans.
- [ ] **15.2.4** Order the cascade: delete channels/groups rows first in bounded chunked batches, then the source row — a crash mid-cascade leaves a re-deletable source, never parentless bulk rows.
- [ ] **15.2.5** Handle deleting the _active_ source deterministically: clear the memory query layer, fall back to the next source or the import card — a decided behavior, not an accident.
- [ ] **15.2.6** Invoke the 13.8 mass-orphan contract for every favorite with the deleted `sourceId` — snapshots stay playable and the favorites view shows the hint.
- [ ] **15.2.7** Delete ephemeral sources (14.5) from memory only — no storage calls that could fail for rows that were never written.
- [ ] **15.2.8** Update storage accounting (15.10) in the same flow so freed rows and bytes appear in the view immediately after the cascade completes.
- [ ] **15.2.9** Unit-test cascade integrity on the tier matrix: post-delete, zero channels/groups rows remain for the id, the source row is gone, its favorites are orphaned, and other sources are untouched.
- [ ] **15.2.10** Manual smoke: delete a 90 k-channel source on the full tier — the UI stays responsive throughout the chunked cascade and the view updates without a reload.

## Feature 15.3 — Manual refresh action (re-fetch → worker re-parse → diff counts)

The refresh pipeline is the workhorse this phase builds everything else on: classified fetch, chunked worker re-parse, generation-safe row replacement, and an identity diff — while browsing and playback continue undisturbed.

- [ ] **15.3.1** Implement `defineFn('refreshSource', id)` driving the pipeline in `src/m3u/refresh.ts`: fetch via the `core/http` adapter → Phase 6 worker re-parse (chunked protocol, §5.10/§6.9) → chunked storage writes → source-meta update.
- [ ] **15.3.2** Expose the action from the source row (15.1) and from the active list's header — both dispatch the same `defineFn`, one implementation.
- [ ] **15.3.3** Guard concurrency: one in-flight refresh per source id (repeat clicks are no-ops), with parallel refreshes of different sources capped at 2 to bound worker memory.
- [ ] **15.3.4** Scope by type: `m3u-url` refreshes; `m3u-file`/`m3u-text` prompt for re-upload/re-paste (nothing to re-fetch); `xtream` content refresh defers to Phase 20 with the button hidden — decision-noted.
- [ ] **15.3.5** Replace rows atomically per source: stage the new generation's rows during the chunked write, swap on the worker's summary message, then drop the old generation — a failed refresh never leaves a half-playlist (staging store vs generation field is an implementation decision to note).
- [ ] **15.3.6** Keep the active source serving its existing in-memory array while refreshing — browsing and playback continue; the memory swap happens only on successful completion.
- [ ] **15.3.7** Compute diff inputs during the chunked pass: identity sets (13.1's `channelIdentity`) for the old and new generations feed added/removed/changed totals into source meta for 15.6.
- [ ] **15.3.8** Route failures through the `classifiedFetch` taxonomy into the 15.9 health model — a failed refresh preserves the previous rows and validators untouched.
- [ ] **15.3.9** Unit-test the pipeline with stubbed http/worker/storage: success updates counts and meta; failure preserves the prior generation; a concurrent duplicate is suppressed.
- [ ] **15.3.10** Manual smoke: refresh a real URL playlist on the built `dist/` — progress visible, UI unblocked, counts updated, playback uninterrupted throughout.

## Feature 15.4 — Conditional GET refresh (ETag/If-None-Match, Last-Modified fallback, 304 fast path per MASTERPLAN.md §6.6)

Most playlists don't change most days. Stored validators turn refresh into a cheap round trip: `If-None-Match` first, `If-Modified-Since` as fallback, and a `304` that skips the parse, the writes — everything.

- [ ] **15.4.1** Persist `etag` and `lastModified` on the source row from every successful full fetch — read from response headers at the single point in the refresh pipeline (§6.6 shape).
- [ ] **15.4.2** Send `If-None-Match` when an ETag is stored, else `If-Modified-Since` from Last-Modified — ETag takes strict precedence, never both blindly.
- [ ] **15.4.3** Implement the `304 Not Modified` fast path: skip the worker parse and all row writes, update `lastRefresh` only, and surface "Up to date" through 15.6's result line.
- [ ] **15.4.4** Rotate validators on every `200`: replace stored values with the fresh headers, or clear them when the headers are absent — stale validators must not stick to new content.
- [ ] **15.4.5** Handle the CORS reality: cross-origin `ETag`/`Last-Modified` are readable only with `Access-Control-Expose-Headers` — absent validators degrade gracefully to unconditional fetches with a diagnostic note, not an error.
- [ ] **15.4.6** Store and replay weak ETags (`W/"…"`) verbatim — no normalization; the server owns validator semantics.
- [ ] **15.4.7** Guard pathological servers: a `304` for a source with no stored rows (first fetch after 14.3's `lastRefresh: 0`) is treated as error-shaped and retried unconditionally once.
- [ ] **15.4.8** Pass conditional headers through the proxy path untouched — a configured proxy template must not silently strip conditional semantics; document the caveat where the proxy setting lives.
- [ ] **15.4.9** Unit-test with a mocked http adapter: `304` skips the parse (worker spy uncalled), `200` rotates validators, the expose-headers-absent path stays unconditional, and weak ETags replay verbatim.
- [ ] **15.4.10** Verify manually against a real ETag-honoring server (a static file host works): the second refresh logs the `304` fast path and completes in milliseconds.

## Feature 15.5 — Staleness policy setting (auto-refresh window per source, on-boot check, off by default)

Auto-refresh exists for people who want it and costs nothing for those who don't: off by default, per-source windows, checked on boot and activation — never on a polling timer, never blocking first paint.

- [ ] **15.5.1** Add `autoRefreshHours` to source meta with `0` = off as the default — per-source only; no global auto-refresh switch in v1 (decision note).
- [ ] **15.5.2** Run the boot check after the 13.9 fast path and `loadActiveSource()` settle: compare `Date.now() - lastRefresh` per URL source and enqueue conditional refreshes (15.4) for stale ones — strictly background, never blocking first paint.
- [ ] **15.5.3** Limit participation to `m3u-url` sources — file/text sources have nothing to auto-fetch, and their rows hide the setting control.
- [ ] **15.5.4** Piggyback staleness checks on boot and on source activation (15.8) — no interval timers polling the clock all session, in the §5.5 spirit.
- [ ] **15.5.5** Respect `navigator.connection.saveData` where available — skip auto-refresh, note it in the source's status line, and leave manual refresh unaffected.
- [ ] **15.5.6** Queue stale sources through the 15.3 in-flight guard with the active source first — the visible list gets fresh data before background sources.
- [ ] **15.5.7** Build the setting UI as a compact select (Off / 6 h / 24 h / 72 h) in the source's settings with strings-module labels, persisted with source meta on the current tier.
- [ ] **15.5.8** Dedupe against the partial tier's boot re-parse — that tier already refetches URL sources on boot, so the staleness check must not fetch the same source twice; document the interaction.
- [ ] **15.5.9** Unit-test the staleness math and gating: off by default, the exact window boundary, the save-data skip, and the boot-fetch dedupe.
- [ ] **15.5.10** Manual smoke: set 6 h on a source, advance the clock, reboot — one conditional refresh fires in the background with the UI interactive throughout.

## Feature 15.6 — Refresh progress and result diff (added/removed/changed counts surfaced)

A refresh should say what it did: live parsed counts while running, then one honest result line — `+added / −removed / ~changed`, or "Up to date" from a `304` — computed in the same pass that feeds reconciliation.

- [ ] **15.6.1** Publish progress into `setValue('sources.refreshProgress', { id, parsed, phase })` from the worker's progress/chunk messages — one compact object, never per-row state.
- [ ] **15.6.2** Render progress in the source row (replacing the age line while running) and on the active list's header — text counts ("42 300 parsed…"), no spinner, no animation.
- [ ] **15.6.3** Show the result diff line after completion — `+added / −removed / ~changed` from the 15.3 identity pass — stored on source meta until the next refresh overwrites it.
- [ ] **15.6.4** Define `changed` precisely: same identity with a different name, logo, url, or group — computed during the single chunked pass with bounded memory (identity → field-hash map, not full row copies).
- [ ] **15.6.5** Report the 15.4 fast path as "Up to date", distinct from `+0 / −0 / ~0` — a server-confirmed no-op is different information from a full parse that found nothing.
- [ ] **15.6.6** Feed the same pass into the 13.8 reconciliation invocation — one pass produces both the counts and the favorites re-link/orphan input; never two scans of the data.
- [ ] **15.6.7** Render failure results in the same slot using the 15.9 classified reason strings — the result line is the single post-refresh communication channel.
- [ ] **15.6.8** Exclude progress values from persistence and from capped Spektrum history (§5.8) — transient by nature, reset on app start.
- [ ] **15.6.9** Unit-test the diff math on synthetic generations: adds, removes, renames, and logo changes counted correctly, with the memory ceiling respected at 100 k identities.
- [ ] **15.6.10** Manual smoke: refresh a playlist edited to add 2 and drop 1 channel — the row shows `+2 / −1 / ~0` and favorites reconciliation ran exactly once.

## Feature 15.7 — Per-source EPG URL association (stored on the source, consumed in Phase 16)

Each source knows where its EPG lives: seeded from the connect fragment or the playlist's own `url-tvg` attribute, editable and validated, stored on the source meta — fetched by nobody until Phase 16.

- [ ] **15.7.1** Add `epgUrl?` to source meta — populated from the connect fragment's `epg` param (14.1) and editable per source from the sources view's action cluster.
- [ ] **15.7.2** Validate edits with the same rule as connect URLs (`new URL()`, http/https only) — invalid input rejected inline with a strings-module message.
- [ ] **15.7.3** Prefill from the playlist itself: `url-tvg`/`x-tvg-url` attributes discovered by the Phase 6 parser fill `epgUrl` only when it was never set — an explicit user value always wins; precedence documented.
- [ ] **15.7.4** Keep the field storage-only this phase: persisted with source meta and displayed, but fetched by nothing — Phase 16's ingestion is the consumer.
- [ ] **15.7.5** Allow many sources to share one EPG URL — stored per source regardless, with a code note flagging the dedupe opportunity for Phase 16's fetch planner.
- [ ] **15.7.6** Include `epg` in the bookmark generator (14.6) for sources that have it — the association survives the connect round trip in both directions.
- [ ] **15.7.7** Distinguish cleared from never-set (empty string vs absent) so the 15.7.3 prefill re-applies only to never-set — semantics recorded as a decision note.
- [ ] **15.7.8** Hold `epgUrl` for ephemeral sources in memory only, consistent with 14.5's no-side-channel rule.
- [ ] **15.7.9** Unit-test precedence (user value over parser prefill), validation, clear-vs-unset semantics, and connect round-trip inclusion.
- [ ] **15.7.10** Manual smoke: import an M3U carrying `url-tvg`, see the prefilled association in the sources view, edit it, reload — the edit survives.

## Feature 15.8 — Active-source switching (memory swap of the query layer, scroll/search state per source)

Switching sources swaps the in-memory query layer — parsed rows streamed from storage into the module-level array — while each source remembers its own scroll position, query, and group filter, and playback never flinches.

- [ ] **15.8.1** Implement `defineFn('activateSource', id)` — a chunked read of the new source's parsed rows from storage into the module-level array via `src/ui/virtual-list.ts`'s `setRows`, then republish; the 90 k array itself never transits Spektrum state (§5.4).
- [ ] **15.8.2** Hydrate in ~5 000-row batches to keep the main thread responsive, with the list showing a progress count until the final batch lands — mirroring the import path's feel.
- [ ] **15.8.3** Save and restore per-source UI state — `ui.perSource[id] = { scrollTop, query, group }` written on switch-away and restored on switch-back through the §6.3 persistence bridge, surviving reloads.
- [ ] **15.8.4** Order the restore: rows first, then the query re-applied through the Phase 9 filter, then `scrollTop` clamped to the new row count — no flash of unfiltered content at a stale offset.
- [ ] **15.8.5** Guarantee playback continuity: the active engine session holds its denormalized snapshot and is untouched by switching — only the browse layer swaps; document the contract with Phase 12.
- [ ] **15.8.6** Read parsed rows only on the full tier — switching never re-parses (parse once, read forever); the partial tier routes through its re-fetch/re-parse flow with progress instead.
- [ ] **15.8.7** Handle switch-during-refresh: activating a source mid-refresh (15.3.6) attaches to the in-progress generation and completes the swap on the worker's summary — no torn array.
- [ ] **15.8.8** Persist the last-active source id (`sources.activeId`) and boot it as the default landing source within the §6.4 sequence.
- [ ] **15.8.9** Unit-test the swap: per-source state save/restore, clamped scroll, filter re-application, and no Spektrum publish exceeding the ~40-row window during hydration.
- [ ] **15.8.10** Manual smoke: hop repeatedly between two 50 k+ sources — sub-second swaps on the full tier, scroll and search restored exactly, playback never stutters.

## Feature 15.9 — Source-level error states (dead URL, auth failed, CORS-blocked — with retry affordances)

Sources fail in different ways and the UI says which: one health field written from the classified-fetch taxonomy, rendered as distinct badges with plain-words lines and a retry — while cached data keeps serving.

- [ ] **15.9.1** Add `health` to source meta — `ok | dead-url | auth-failed | cors-blocked | timeout` — written by the refresh pipeline from the `classifiedFetch` taxonomy plus HTTP status mapping (401/403 → auth-failed; 404/5xx → dead-url).
- [ ] **15.9.2** Render health as a compact badge plus a strings-module plain-words line in the source row — the same classification vocabulary as playback failures (11.8) and connect messaging (14.8); one taxonomy, three surfaces.
- [ ] **15.9.3** Wire the retry affordance on unhealthy rows to re-dispatch `refreshSource` — success clears health to `ok` in the meta update; no separate reset action exists.
- [ ] **15.9.4** Guarantee failures never destroy data: cached rows, validators, and counts survive any failed refresh, and the badge line says so ("showing the last successful refresh from …").
- [ ] **15.9.5** Reuse the 14.8 alternatives block for `cors-blocked` (proxy setting, download-and-upload, desktop app) — the shared partial, not duplicated prose.
- [ ] **15.9.6** Pre-classify mixed-content sources (`http://` URL on the https origin) without running a doomed fetch, mirroring 14.8.6.
- [ ] **15.9.7** Back off auto-refresh (15.5) for unhealthy sources — skip scheduled attempts until a manual retry succeeds, so a dead or auth-failed endpoint is never hammered; policy decision-noted.
- [ ] **15.9.8** Append health transitions to the bounded diagnostics recorder (the 11.8 ring-buffer pattern) with URLs redacted — debuggable without credential leakage.
- [ ] **15.9.9** Unit-test the mapping table: every `classifiedFetch` outcome and HTTP status class lands on the intended health token, retry clears it, and cached data is preserved.
- [ ] **15.9.10** Manual smoke: point sources at a 404, a wrong-credentials URL, and a CORS-less host — three distinct badges with accurate plain-words lines and working retries.

## Feature 15.10 — Storage accounting (rows and approximate bytes per source, shown in sources view)

Storage is finite — especially on the partial tier — so the sources view says what each playlist costs: row counts and approximate bytes accumulated at write time, a global usage line, and numbers that track deletes and refreshes.

- [ ] **15.10.1** Accumulate approximate bytes at write time: the chunked persist path sums serialized chunk sizes per source into `meta.approxBytes` — measurement rides the existing write, never a second pass over 90 k rows.
- [ ] **15.10.2** Show the footprint per row — "88 412 channels · 610 groups · ~21 MB" — combining the parse-summary counts already in meta with the byte estimate through one formatter.
- [ ] **15.10.3** Implement the byte formatter (KB/MB, one decimal) beside the strings/format helpers — shared with any future quota surfaces.
- [ ] **15.10.4** Update `approxBytes` in the delete (15.2) and refresh (15.3) meta writes — accounting tracks reality, and the "~" in the label owns the approximation honestly.
- [ ] **15.10.5** Add a global line atop the sources view: the per-source sum plus `navigator.storage.estimate()` usage/quota where the API exists, degrading to the sum alone where it doesn't.
- [ ] **15.10.6** Account the partial tier against its real constraint: report the small-data footprint versus the ~5 MB localStorage budget from the 13.6.8 allocation — the tier where bytes threaten function gets the most honest number.
- [ ] **15.10.7** Structure `approxBytes` as a per-kind map (`channels` now) so Phase 16 adds an `epg` key without a meta migration — reserve the shape, not the feature.
- [ ] **15.10.8** Guarantee accounting survives reload: meta persists with the source row and a reload renders identical numbers with zero recomputation.
- [ ] **15.10.9** Unit-test the accumulation math across chunked writes, refresh replacement (old size dropped, new size counted), delete zeroing, and formatter output.
- [ ] **15.10.10** Manual smoke: import a large playlist and compare the shown `~MB` against devtools' IndexedDB usage — same ballpark; delete the source and watch both numbers fall.
