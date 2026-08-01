# Phase 21 — Xtream VOD & Series

> **Epic goal:** Movies and series arrive in the same minimal UI language the rest of the app speaks — lazily loaded, TTL-cached catalogs rendered as virtualized poster grids, detail as an inline expanding panel, and episode playback with resume positions that survive a reload.
> **Verification:** Against the fixture provider corpus (clean and dirty), the VOD and series views browse a 10 k-title catalog as virtualized poster-card rows with the DOM bounded to the windowed slice and no dropped frames; inline detail opens with no route change; an `.mp4` movie and a series episode play through the unchanged engine-selection path with every credential-bearing URL built only in `src/xtream/urls.ts`; reloading mid-movie shows the resume prompt at the saved position on both the full and partial tiers; the next-episode prompt resolves across a season boundary without autoplay; `npm test` (corpus suites over the storage matrix), `npm run build`, `npx tsc --noEmit`, and ESLint are all green.
> **Status:** `partial` · tracker: `not-maintained` — VOD and series catalogs, the poster grid, inline detail, episode playback and resume positions all ship (`vod.*`/`series.*`, `catalog-*.ts`, `grid-metrics.ts`, `player/position.ts`) — plus downloads, which this phase did not anticipate. **Feature 21.6's next-episode affordance is not built at all:** there is no `nextEpisode()` resolver, no ended-prompt, and no `playback.autoAdvance` seam — `position.ts` listens for `ended` only to mark an item watched. Episodes play; nothing offers you the next one. Persistence took a shape the plan did not specify: catalogs bypass the bulk-table surface entirely. That is AUDIT §4.6 and UPGRADES **U9**, still open. **One known gap:** 21.9.6's `/` search shortcut does not exist — the same missing shortcut recorded under Phase 09, which owns the fix for both.

Before this phase, Xtream sources browse and play live TV (Phases 19–20), but the VOD and Series entries are stubs — the API client, URL module, and TTL-cache policy exist without a movie or episode ever flowing through them. After it, `get_vod_categories`/`get_vod_streams`/`get_series`/`get_series_info` feed lazily loaded catalogs into poster-card rows driven by the same Phase 08 windowing controller as the channel list (taller fixed row height, cards instead of channels), detail opens as an inline expanding panel — no hero page, no route change, provider data only — movies and episodes play through the unchanged engine-selection path, resume positions persist tier-aware behind an explicit resume-or-restart prompt, and the whole surface is locked down by an integration corpus that includes deliberately dirty provider payloads.

## Feature 21.1 — VOD category and item loading

VOD data loads exactly the way live did in Phase 20 — categories up front, items lazily per selected category, everything TTL-stamped — so a 20,000-title catalog never loads eagerly and never re-fetches while fresh.

- [ ] **21.1.1** Endpoint map extension — add `get_vod_categories` and `get_vod_streams` (with `category_id`) to the Phase 19 action map in `src/xtream/api.ts`, typed like the live actions.
- [ ] **21.1.2** VOD catalog store — create `src/xtream/vod-catalog.ts` holding categories and per-category item arrays in plain module memory per §5.4, publishing only derived counts and windowed slices into Spektrum state.
- [ ] **21.1.3** Categories on first open — fetch `get_vod_categories` the first time the VOD view activates and render the category strip via one `data-each`, with the "All"/"Uncategorized" entry policy noted as a decision.
- [ ] **21.1.4** Lazy per-category items — fetch `get_vod_streams&category_id=` only on first selection of a category, driving a compact loading readout ("1 240 titles…") from a single Spektrum scalar.
- [ ] **21.1.5** TTL freshness — stamp every cached payload with `fetchedAt` and reuse the Phase 20 TTL policy (fresh < 24 h skips the network); a manual "Refresh" on the source forces a refetch.
- [ ] **21.1.6** Full-tier-only caching — persist VOD categories and items through the `StorageAdapter` on the full tier only; partial and none tiers hold them in session memory and refetch per boot, since bulk caches are full-tier-only by contract.
- [ ] **21.1.7** Dirty-row normalization — coerce provider quirks at the store boundary: string vs number `stream_id`, missing `container_extension`, `rating` as string, and null/unknown `category_id` routed to the Uncategorized bucket.
- [ ] **21.1.8** Action-layer selection — route category selection through `defineFn('selectVodCategory')` so the lazy fetch, UI state, and per-view snapshot persistence all hang off one action per §6.3.
- [ ] **21.1.9** Classified fetches — issue every VOD call through `core/http`'s `classifiedFetch` with the proxy template applied, mapping failures into the Phase 19 Xtream error taxonomy.
- [ ] **21.1.10** Loading unit tests — cover TTL freshness decisions with a mocked clock, dirty-row coercions, and full-vs-partial caching semantics against the storage matrix.

## Feature 21.2 — Virtualized poster grid

Poster browsing reuses the Phase 08 windowing controller verbatim — the only change is a taller fixed row height and rows that hold N cards instead of one channel, so a 20 k-title catalog scrolls within the same bounded-DOM budget from §3.

- [ ] **21.2.1** Parameterized row height — refactor the windowing controller in `src/ui/virtual-list.ts` to take its fixed row height as a parameter instead of the hardcoded channel `ROW_H`, with zero behavior change for the channel list.
- [ ] **21.2.2** Card row constant — define `CARD_ROW_H` per density (e.g. 248 px comfortable / 208 px compact) beside the channel row constants; heights are fixed and never measured, per §6.1.
- [ ] **21.2.3** Row chunking — implement `src/ui/poster-grid.ts` chunking the in-memory catalog array into card-row models of `cardsPerRow` items (computed once from container width), kept in module memory.
- [ ] **21.2.4** Windowed publication — publish only the visible card-row slice via `setValue('vod.visibleRows', slice)` with `padTop`/`padBottom` spacers, exactly the §5.4 pattern.
- [ ] **21.2.5** Grid template — render rows with one `data-each` over card rows and a nested card template (poster box, title, year), all sized from `tokens.css`, with no transitions anywhere.
- [ ] **21.2.6** Resize re-chunk — recompute `cardsPerRow` on a debounced `ResizeObserver` callback and on density change, re-chunk, and restore the scroll anchor (first visible item index → new row index × `CARD_ROW_H`).
- [ ] **21.2.7** rAF-throttled scroll — reuse the §6.1 rAF-throttled scroll handler so a fling over 20,000 titles republishes at most once per frame.
- [ ] **21.2.8** Card activation — bind card clicks with `data-action` into `defineFn('openVodDetail')` dispatching the item id; the grid module owns no detail logic.
- [ ] **21.2.9** Chunking unit tests — cover remainder rows, `cardsPerRow` changes, index↔row mapping, and scroll-anchor restoration in the poster-grid spec.
- [ ] **21.2.10** Scroll audit — profile a 10 k-item fixture scroll on built `dist/` (Performance panel): no dropped frames, no layout-shift entries, DOM card count bounded to the window; record the numbers in this phase file.

## Feature 21.3 — VOD inline detail panel

Detail is information on demand, not a destination — an inline expanding panel injected into the grid under the selected card's row, showing provider data only (plot, year, rating, container extension). No hero page, no route change, no external metadata calls.

- [ ] **21.3.1** Injected detail row — insert a full-width detail row model directly after the selected card's row in the chunked sequence, so the panel scrolls as part of the same windowed list.
- [ ] **21.3.2** Fixed detail height — give the detail row its own fixed height constant included in the pad math, keeping scroll position exact while a panel is open.
- [ ] **21.3.3** Single open panel — track the open item in one `vod.detailId` value; selecting another card moves the panel, selecting the same card or pressing Esc closes it (`data-if` on the row model).
- [ ] **21.3.4** Provider fields only — render plot, year/release date, rating, genre, duration, and `container_extension` straight from the `get_vod_streams` payload; no TMDB, no extra requests (plan non-goals).
- [ ] **21.3.5** Absent-field collapse — hide missing fields entirely via per-line `data-if` instead of rendering "N/A" placeholders, keeping the panel calm on sparse providers.
- [ ] **21.3.6** Panel actions — render a primary Play action plus a favorite toggle, both dispatching the same `defineFn` actions used elsewhere (`playVod`, the favorites feature), with labels from the strings module.
- [ ] **21.3.7** Keyboard contract — Enter on a focused card opens the panel and moves focus to Play; Esc returns focus to the card; record the divergence from list rows (where Enter plays immediately) as a decision note.
- [ ] **21.3.8** Off-screen economy — apply `content-visibility: auto` to the panel's heavier blocks and keep the collapsed state entirely absent from the DOM.
- [ ] **21.3.9** Boundary tests — unit test detail-row injection at the first row, last row, and mid-catalog, asserting pad heights and total scroll height stay consistent.
- [ ] **21.3.10** Strings sweep — verify every literal in the detail partial resolves through the central strings module with the same grep check used on the import card.

## Feature 21.4 — VOD playback

A movie is just a URL with a container extension — playback goes through the Phase 10 host and the unchanged engine-selection path, with the Xtream URL module as the only place that credential-bearing URL is ever assembled.

- [ ] **21.4.1** Movie URL builder — add `vodStreamUrl(source, streamId, containerExt)` to the Phase 19 URL module in `src/xtream/urls.ts` (`{url}/movie/{user}/{pass}/{id}.{ext}` per §6.8); no other module concatenates movie URLs.
- [ ] **21.4.2** Extension fallback — default a missing or blank `container_extension` to `mp4` at the normalization boundary and count the fallbacks in the category summary for visibility.
- [ ] **21.4.3** Play action — implement `defineFn('playVod')` resolving the URL and setting `player.active` to a denormalized VOD snapshot (`name`, `poster`, `kind: 'vod'`, ids — never the credential URL) before handing off to the player host.
- [x] **21.4.4** Engine selection unchanged — let `selectEngine()` pick by extension exactly as for live (`.m3u8` → hls.js/native, `.ts` → mpegts.js, `mp4`/`mkv`/other → native `<video>`); zero VOD-specific engine code. *(Landed as `attemptChain()`/`isProgressiveFile()` in `src/player/engine-select.ts`. Until it did, every movie was handed to mpegts.js and then hls.js first — the latter reads a whole response body as text looking for `#EXTM3U` — so a film downloaded in the background behind an endless spinner instead of streaming. `attachAndPlay({ live })`, fed from `player.active.kind`, carries the live/VOD distinction the rest of the way to mpegts.js's `isLive`.)*
- [ ] **21.4.5** Mixed-content pre-check — run the §5.9 helper against the movie URL before playback and show the specific explanation (desktop build unaffected) instead of a silent engine failure.
- [ ] **21.4.6** Seekable transport — enable the seek bar in dock and theater for VOD (live hides it), driven by the existing transport bindings plus duration from the media element.
- [ ] **21.4.7** VOD keyboard split — while a VOD title plays, map ←/→ to ±10 s seek instead of live zap, keeping the player key context conflict-free.
- [ ] **21.4.8** Recent snapshot — record played movies into recent as denormalized snapshots (ids plus display data, URL rebuilt at play time) so they stay usable after reboot on the partial tier.
- [ ] **21.4.9** Redaction hygiene — pass every playback log line through the redacting-logger seam so the `/movie/{user}/{pass}/` path never reaches a console or diagnostic string raw (§7; the seam completes in Phase 23).
- [ ] **21.4.10** Playback smoke — on built `dist/` against the mock corpus, play an `.mp4` and an `.mkv` title, seek, close, and zap to live, verifying destroy-before-create teardown (§5.3) leaves no MediaSource behind.

## Feature 21.5 — Series listing and detail

Series reuse the whole VOD surface — the same poster grid, the same inline panel — with `get_series` for the catalog and a lazily fetched `get_series_info` powering seasons-as-tabs and an episodes list, normalized against real-world payload chaos.

- [ ] **21.5.1** Series endpoints — add `get_series` and `get_series_info` (with `series_id`) to the action map, alongside `get_series_categories` for the category strip.
- [ ] **21.5.2** Shared grid reuse — render the series catalog through the same `poster-grid.ts` module parameterized by catalog (cover URL, name, year fields differ) — never a copied grid.
- [ ] **21.5.3** Lazy series info — fetch `get_series_info` on first detail open per series, cached under the same TTL policy and full-tier-only persistence as VOD payloads.
- [ ] **21.5.4** Episodes-shape coercion — normalize the `episodes` payload at the boundary: object-keyed-by-season, array-of-arrays, and gap seasons all coerce to a sorted `season → Episode[]` map with numeric episode ordering.
- [ ] **21.5.5** Seasons as tabs — render season numbers as a `data-each` tab strip inside the inline panel with the selected season in one Spektrum value; only the selected season's episodes exist in the DOM.
- [ ] **21.5.6** Episodes as a list — render each episode as one flex line (number, title, duration when present) using the channel-row density tokens.
- [ ] **21.5.7** Same panel mechanics — mount series detail through the identical injected-row mechanism as Feature 21.3, with the season/episode block replacing the single Play action.
- [ ] **21.5.8** Watch-state markers — derive per-episode resumed/watched markers from the 21.7 positions map via one `computed()` per open panel — no per-episode lookups during scroll and no timers.
- [ ] **21.5.9** Degenerate payloads — a `get_series_info` response without episodes renders an in-panel classified message with a retry action instead of an empty tab strip.
- [ ] **21.5.10** Coercion tests — unit test the season map against object-keyed, array, gap-season, and empty fixtures from the corpus.

## Feature 21.6 — Episode playback with next-episode affordance

Finishing an episode should invite — never force — the next one: an ended-event prompt with the next episode resolved across season boundaries, defaulting to no autoplay so the TV never runs away on its own.

- [ ] **21.6.1** Episode URL builder — add `seriesEpisodeUrl(source, episodeId, containerExt)` (`{url}/series/{user}/{pass}/{episodeId}.{ext}`) to `src/xtream/urls.ts`, unit-tested beside the movie builder.
- [ ] **21.6.2** Episode play action — implement `defineFn('playEpisode')` carrying `seriesId`, season, and episode number in the `player.active` snapshot so resume keys and next-episode resolution are deterministic.
- [ ] **21.6.3** Next-episode resolver — implement a pure `nextEpisode(seasonMap, current)` helper: next in season, else first episode of the next season, else `null` — no state reads inside.
- [ ] **21.6.4** Ended prompt — on the media `ended` event show a dock/theater prompt naming the next episode ("Next: S02E01 — title") with Play next and Dismiss actions; nothing plays without consent.
- [ ] **21.6.5** Prompt keyboard flow — focus lands on Play next, ←/→ switch actions, Enter confirms, Esc/Back dismisses back to the series panel — pointer-free by construction.
- [ ] **21.6.6** Autoplay seam — gate auto-confirmation behind a single `playback.autoAdvance` state read (default `false`) so Phase 22's autoplay policy can enable it without touching player code.
- [ ] **21.6.7** Teardown discipline — start the next episode through the same destroy-before-create host path; assert only one engine instance exists across the handoff.
- [ ] **21.6.8** Series-end behavior — when no next episode exists, skip the prompt and return quietly to the detail panel with the finished episode marked watched.
- [ ] **21.6.9** Prompt strings — build the prompt line through the strings module's format helper (season/episode/title parameters), never by concatenation at the call site.
- [ ] **21.6.10** Resolver tests — cover mid-season, season-boundary, series-end, and gap-season fixtures, plus an integration test that a simulated `ended` produces the right prompt payload.

## Feature 21.7 — Resume positions

Resume data is the small-valuable kind: a capped map of playback positions persisted through the bridge so it survives on the partial tier, surfaced as an explicit resume-or-restart prompt rather than a silent seek.

- [ ] **21.7.1** Positions module — create `src/player/resume.ts` owning a map keyed `vod:{sourceKey}:{streamId}` / `series:{sourceKey}:{episodeId}` holding `{position, duration, updatedAt}`.
- [ ] **21.7.2** Throttled persist — write positions on a ~10 s `timeupdate` throttle plus on pause and teardown, through the Phase 05 `persist()` bridge — never a storage call per media event.
- [ ] **21.7.3** Partial-tier survival — keep the serialized map inside the localStorage small-data budget and include it in the partial tier's valuable set beside settings and favorites, so resume works after reboot on constrained devices.
- [ ] **21.7.4** LRU cap — cap the map at 200 entries evicting the oldest `updatedAt`, so a heavy VOD user never grows the snapshot unbounded.
- [ ] **21.7.5** Resume prompt — on playing an item with a stored position ≥ 30 s and < 95 % of duration, prompt "Resume at 41:20 / Start over" instead of silently seeking; Enter resumes, Esc dismisses without playing.
- [ ] **21.7.6** Watched threshold — crossing 95 % marks the item watched and deletes its position entry, feeding the 21.5.8 markers.
- [ ] **21.7.7** Boot rehydration — load the positions map in the `main.ts` boot order before first render so episode markers and prompts are correct immediately after a reload.
- [ ] **21.7.8** No credentials at rest — store ids only and rebuild stream URLs at play time via `src/xtream/urls.ts`; a test asserts no stored position value ever contains `username=` or a `/movie/` path.
- [ ] **21.7.9** Position unit tests — cover the throttle, the 30 s / 95 % thresholds, LRU eviction, and round-trips across all three tiers via the storage matrix.
- [ ] **21.7.10** Reload smoke — on built `dist/`, stop a movie mid-way and reload on the full and partial tiers, verifying the prompt shows the saved timestamp; record results here.

## Feature 21.8 — Artwork lazy loading and fallbacks

Posters are pure decoration until proven otherwise — lazy, fixed-box, and falling back to a flat placeholder on any failure, so a catalog with 5,000 dead image URLs scrolls exactly like one with none.

- [ ] **21.8.1** Lazy fixed-box images — render every poster/cover as `<img loading="lazy" decoding="async">` inside a fixed 2:3 box sized by `tokens.css`, so load, error, and hidden states never shift layout.
- [ ] **21.8.2** Flat placeholder — build one shared placeholder partial (first letters of the title over a flat token background color) shown via `data-if`; no gradients, no animation, no network.
- [ ] **21.8.3** Short-circuit empties — treat empty, whitespace, and obviously invalid `stream_icon`/`cover` values as placeholder immediately, issuing no request.
- [ ] **21.8.4** Error fallback — swap to the placeholder on the image `error` event, covering dead hosts and mixed-content-blocked `http://` artwork on the `https://` origin alike.
- [ ] **21.8.5** Dead-URL memo — remember failed artwork URLs in a session-level `Set` so re-scrolling a window never re-requests a known-dead image.
- [ ] **21.8.6** Shared with channel logos — extract the placeholder and error handling into one module reused by the Phase 08 channel-logo path, deleting any duplicated fallback markup.
- [ ] **21.8.7** Appearance seam — honor the artwork/logo visibility toggle (canonicalized in Phase 22's Appearance section) by removing the `<img>` via `data-if` while keeping the fixed box, so no reflow ever occurs.
- [ ] **21.8.8** Episode stills stay out — record the decision that episode-level artwork from `get_series_info` is not rendered in v1, keeping episode rows text-only and light.
- [ ] **21.8.9** Network audit — verify with the DevTools network panel that off-screen cards issue zero image requests during a fast scroll; record the observation here.
- [ ] **21.8.10** Fallback tests — unit test the artwork decision function (render image / placeholder / memo-suppressed) across empty, valid, failed, and repeated-failure inputs.

## Feature 21.9 — VOD/series search

Search over movies and series is the Phase 09 pipeline pointed at another in-memory array — same normalization, same incremental narrowing, same < 50 ms budget — scoped to the view the user is looking at.

- [ ] **21.9.1** Catalog registration — feed VOD and series catalogs through the Phase 09 pipeline with normalized title keys (case/diacritics folding) computed once at load time and stored beside each item.
- [ ] **21.9.2** View-scoped queries — scope search to the active view (VOD searches VOD, series searches series, live keeps Phase 09 behavior) with the scope named in the input placeholder from the strings module.
- [ ] **21.9.3** Incremental narrowing — reuse the previous result set while the query only grows, per the §3 search budget; deletions and edits restart from the full catalog.
- [ ] **21.9.4** Results through the grid — render results by re-chunking the filtered array through `poster-grid.ts` — no separate results view, no second rendering path.
- [ ] **21.9.5** Unloaded-category honesty — when lazy categories remain unfetched, search only loaded items and show a one-line count hint ("searching 3 400 loaded titles"), never a silent partial answer.
- [ ] **21.9.6** One search shortcut — `/` focuses the search input in the VOD and series views through the same central registration the channel list uses; no per-view key handlers.
- [ ] **21.9.7** Clear restores — clearing the query restores the unfiltered chunking and the pre-search scroll anchor.
- [ ] **21.9.8** Empty-result state — show a centered plain-words empty state echoing the query, with no spinner and no animation.
- [ ] **21.9.9** Latency measurement — measure keystroke→published-slice latency over the 10 k fixture with `performance.now()` in a dev harness, assert < 50 ms, and record the number here.
- [ ] **21.9.10** Scope tests — unit test scope routing, incremental reuse-vs-restart transitions, and the loaded-only hint against the fixture corpus.

## Feature 21.10 — VOD/series integration tests

The whole phase is held together by a fixture provider corpus — including deliberately dirty payloads modeled on real providers — driven end-to-end through a mocked `player_api.php`, so regressions in loading, URLs, resume, or coercion fail loudly.

- [ ] **21.10.1** Fixture corpus — build `tests/fixtures/xtream-corpus/` with clean and dirty catalogs (string ids, null categories, missing `container_extension`, HTML fragments in plots), object- and array-keyed episodes, and empty categories.
- [ ] **21.10.2** Mock provider — implement a fetch-stub `player_api.php` handler dispatching on the `action` parameter (`get_vod_categories`, `get_vod_streams`, `get_series`, `get_series_info`) over the corpus, shared with the Phase 20 live suites.
- [ ] **21.10.3** VOD end-to-end — integration test: open VOD → lazy category fetch → chunked grid rows → inline detail fields, asserted against both the clean and dirty corpora.
- [ ] **21.10.4** Series end-to-end — integration test: series detail → season coercion → episode URL construction → next-episode resolution across a season boundary.
- [ ] **21.10.5** Resume end-to-end — persist a position, simulate a reload (fresh store, boot rehydration), and assert the resume prompt payload and episode watch markers.
- [ ] **21.10.6** Storage-matrix run — execute the VOD/series suites over the memory, localStorage, and fake-indexeddb tiers, asserting bulk catalog caching happens on the full tier only.
- [ ] **21.10.7** Credential scan — assert no test snapshot, stored value, or diagnostic string contains the corpus's fake password, wiring the scan as a reusable denylist helper for Phase 23.
- [ ] **21.10.8** TTL behavior — with a mocked clock, assert a fresh cache skips the network, a stale cache refetches and replaces, and a forced refresh bypasses TTL.
- [ ] **21.10.9** Hostile-payload regression — a provider returning an HTML error page for a JSON action classifies as a parse-kind Xtream error and never throws past the store boundary.
- [ ] **21.10.10** Phase bookkeeping — check every box, record the phase's decision notes (Enter-opens-detail, `mp4` fallback, text-only episodes), and run the standing verification checklist from MASTERPLAN.md §3.
