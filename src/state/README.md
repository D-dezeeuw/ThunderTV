# Spektrum state architecture (Phase 05)

`src/state/` is the app's single state layer. Every Spektrum key has exactly
one owning module, one persistence class, and (if it's a mutation) exactly
one `defineFn` action that may write it. This file is the map; the
generated `masterplan/reference/state-keys.md` is the per-key detail.

## Module ownership

| Module              | Keys                                                                                                          | Persisted?                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `playlist.ts`        | `playlist.sources`, `playlist.activeSourceId`, `playlist.demoRows`                                                   | `activeSourceId` yes (Feature 08.10.6); `sources` is a live storage projection, `demoRows` is static demo data — neither persists |
| `player.ts`          | `player.active`, `player.zapHistory`, `player.visualizerPreset`, `player.visualizerPaused`, `player.audioMode`        | Yes — the §6.4 instant-restore pair; `visualizerPreset` also persists (the listener's Radio visualizer choice) and so does `audioMode` (watch TV channels audio-only, with the visualizer standing in for the picture — a viewing preference, and the player bar always carries the switch back); `visualizerPaused` does not (always false on a fresh Radio visit) |
| `xtream-epg-load.ts` | *(no keys of its own — writes `settings.epgFeedThrough` and the `epgChannels`/`epgPrograms` storage tables)* | n/a — the Xtream guide pipeline. `loadXtreamGuide()` pulls the panel's whole `xmltv.php` once per source (12h TTL); `ensureChannelEpg()` fills a single channel via `get_short_epg` when it starts playing with nothing to show. Joined by `epg_channel_id`/`tvgId`, so it uses none of `src/epg/`'s catalog or matcher |
| `player-tracks.ts`   | `player.audioTracks`, `player.subtitleTracks`, `player.trackMenu`                                                     | No — the dock/theater popups' own published lists (`player-tracks.actions.ts`'s `registerTrackSync()` republishes them from `getPlayerTracks()`) and which popup is open (`'audio' \| 'subtitles' \| 'visualizer'` — Radio's preset picker shares the key so only one can be open); rebuilt every stream, never restored |
| `epg.ts`             | `epg.tick`                                                                                                            | No — a heartbeat timestamp, recomputed every boot |
| `epg-settings.ts`    | `settings.epgCacheState`, `settings.epgCatalogCount`                                                                  | No — transient Settings → Diagnostics feedback (`epg-settings.actions.ts`'s `refreshEpgCatalog()`/`clearEpgCache()`) and a derived count `state/epg-load.ts`'s `loadDefaultEpg()` re-publishes on every run; neither survives a reload (nor should — the count is wrong the instant the underlying `epgCatalog` table changes) |
| `settings.ts`        | `settings.locale`, `settings.proxyTemplate`, `settings.proxyError`, `settings.proxySaved`, …, `settings.audioLanguage`, `settings.subtitleLanguage`, `settings.nav.movies`, `settings.nav.series`, `settings.liveEpgVerifiedOnly` | `locale` yes (Settings → User language switcher, i18n follow-up); `proxyTemplate` yes; `audioLanguage`/`subtitleLanguage` yes (Phase 21); `nav.movies`/`nav.series` yes, same default-on rail-toggle contract as every other `settings.nav.*` key; `liveEpgVerifiedOnly` yes (Phase 31, off by default); the transient feedback keys don't persist |
| `health.ts`          | `settings.healthTrackedCount`, `settings.healthDeadCount`, `settings.healthCleared`                                   | No — a derived readout republished from the `streamHealth` table (Phase 33) plus a one-shot confirmation; the evidence itself is storage-owned, never a Spektrum key |
| `codex.ts`           | `settings.codexState`, `settings.codexMessage`, `settings.codexAuthorId`                                              | No — export/import feedback (Phase 34). The document is built on demand and handed to a download; `codexAuthorId` is derived at boot from the durable `codex.identity.*` kv keys |
| `codex-library.ts`   | `settings.codexLibraryRows`, `settings.codexLibraryState`, `settings.codexLibraryMessage`, `settings.codexBlockedRows` | No — a view model over storage (Phase 37). Subscriptions live under `codex.library.*` and the blocklist under `codex.blocked`; retained Codexes are bulk data and never enter Spektrum state. The follow field is an uncontrolled `data-ref` input, deliberately not a key |
| `handoff.ts`         | `player.handoffLink`, `player.handoffState`, `player.handoffMessage`                                                  | No — the link outlives its usefulness within hours (Phase 38), and is published rather than hidden only so it can be read off screen where no clipboard exists |
| `ui.ts`               | `ui.activeView`, `ui.density`, `ui.theme`, `ui.fontSize`, `ui.settingsOpen`, `ui.storageNoticeDismissed`, `platform.name`, `platform.capabilities`, `storage.tier` | `ui.density`/`ui.theme`/`ui.fontSize`/`ui.storageNoticeDismissed` yes; the rest no |
| `wizard.ts`           | `ui.wizardOpen`, `ui.wizardStep`, `ui.setupComplete`                                                                 | `ui.setupComplete` yes — it is what stops a configured install from being asked again; `wizardOpen`/`wizardStep` no (transient, recomputed/reset every boot and every (re)open, same reasoning as `ui.settingsOpen`) |
| `boot.ts`             | `ui.bootPhase`                                                                                                        | No — the wallpaper splash's `'loading' \| 'exiting' \| 'done'` lifecycle, recomputed fresh (always starts at `'loading'`) every boot |
| `list.ts`             | `list.visibleRows`, `list.padTop`, `list.padBottom`, `list.selectedId`                                               | No — the Feature 08.1/08.2/08.7 virtual-list window and selection cursor, republished continuously |
| `list-state.ts`       | `ui.listState`, `ui.activeGroup`, `ui.viewMode`                                                                      | `ui.listState` yes (Feature 08.6, LRU-capped at 20 sources); the two live mirrors restore from it on source entry but aren't separately persisted |
| `list-groups.ts`      | `list.groups`, `list.groupsTruncated`                                                                                | No — the groups panel's own row set, capped independently of Phase 06's `MAX_GROUPS` (Feature 08.5.9) |
| `favorites.ts`        | `favorites.ids`, `favorites.rows`                                                                                     | No — two live projections of the real `favorites` storage table (Feature 08.8.4), exactly like `playlist.sources`. `ids` is the O(1) star-badge lookup, `rows` is the Starred view's newest-first row source; both are written only by `publishFavorites()`, never apart — that is how a starred row and a Starred tab get to disagree |
| `vod.ts`              | `vod.categories`, `vod.activeCategoryId`, `vod.status`, `vod.errorReason`, `vod.count`, `vod.detailId`, `vod.detail`, `vod.warmStatus` | No (Phase 21) — the Movies catalog itself (categories/items/detail cache) lives in `vod-rows.ts`'s module memory and, on the `'full'` storage tier only, in ad hoc `catalog-storage.ts` keys outside the Phase 05 bridge; see "Existing-key decisions" below |
| `series.ts`           | `series.categories`, `series.activeCategoryId`, `series.status`, `series.errorReason`, `series.count`, `series.detailId`, `series.detail`, `series.warmStatus` | No (Phase 21) — same reasoning as `vod.ts`, via `series-rows.ts`/`catalog-storage.ts` |
| `vod.ts`/`series.ts`  | (also `vod.stale`, `series.stale`)                                                                                   | No — each describes this session's last fetch attempt; a restored `true` would accuse a healthy boot of being offline before it had tried anything |
| `search.ts`           | `search.query`, `search.scope`, `search.active`, `search.resultCounts`, `search.loadedOnly`                           | No (Phase 21) — a live, disposable session activity, reset every boot like `ui.settingsOpen` |
| `downloads.ts`        | `downloads.items`, `downloads.activeId`                                                                              | No — the save-file handle and the transfer belong to the session that started them, so a restored queue would show rows nothing could resume; a reload genuinely does abandon an in-flight download |

**The rule:** adding a Spektrum key means adding it to `registry-keys.ts`'s
`KEY_REGISTRY` (owner, `persisted`, optional `maxItems`/`version`,
description) and to the table above, in the same commit. `registry.ts`
itself is just the query surface (`isPersistedKey()`, `persistedKeys()`, …)
and re-exports the table, so every existing `from './registry'` import
still resolves. `KEY_REGISTRY` is
the single source of truth the persistence bridge (05.3), boot rehydration
(05.4), the bulk-data guard (05.8), and the generated reference doc (05.9)
all read — nothing downstream should ever need a second list.

## Layering rule

- `src/state/**` may import from `spektrum`, `src/core/**`, and
  `src/app/router.ts`/`src/app/strings.ts` (types/constants only) — never
  the other direction. Nothing in `src/app/`, `src/ui/`, or elsewhere reads
  or writes Spektrum state except through a `state/*` export.
- **No bare `setValue` outside `src/state/`.** Enforced by an ESLint
  `no-restricted-syntax` rule (`eslint.config.js`, Feature 05.2.5) banning
  any `setValue(...)` call site outside `src/state/**`, with two carve-outs:
  `src/app/router.ts` (the sole sanctioned publisher of `ui.activeView`,
  see below) and `*.spec.ts` files anywhere (test arrange-phase setup).
- `computed()` selectors are read-only by construction — `src/state/*.selectors.ts`
  files never call `setValue`/`set()`.

## Sanctioned non-action publishers

Two keys are written directly with `setValue`, not through a `defineFn`
action, because nothing user-triggered causes the write:

- **`ui.activeView`** — written only by `src/app/router.ts`'s `applyRoute()`,
  driven by `hashchange`/the initial URL. `initUiState()` deliberately does
  not seed this key; the router is its only writer, always.
- **`epg.tick`** — written by `src/state/epg.ts`'s `startEpgTick()`, driven
  by a 30s `setInterval` (masterplan §5.5's single global heartbeat, instead
  of a timer per visible row).

- **`list.visibleRows`/`list.padTop`/`list.padBottom`** — published by
  `src/ui/virtual-list.ts`'s `publishWindow()` on every scroll-driven
  republish, via `state/list-publish.ts`'s `publishListWindow()` (the actual
  `setValue`/`set()` call site — `virtual-list.ts` itself never imports
  `spektrum` directly, keeping the "no bare `setValue` outside `src/state/`"
  rule intact without a fourth ESLint carve-out). Anything *derived* from
  the window (row count, empty-list flag) belongs in a `computed()` instead
  (Feature 05.6.4) — none exists yet, nothing has needed one.

## Naming rules

- **Keys:** `module.camelCase` (`player.active`, `ui.storageNoticeDismissed`).
  Always a typed constant exported from the owning module — no string
  literals at call sites.
- **Actions:** `module/verbPhrase` (`player/setActiveChannel`,
  `ui/toggleSettings`, `playlist/pickM3uFile`) — the `defineFn` name doubles
  as the `data-fn` markup attribute.
- **Renaming a persisted key** requires a Feature 04.9 migration hook
  (`src/core/storage/versioning.ts`) — a stored blob under the old key would
  otherwise silently stop being read. Bump `KeyMeta.version` in the same
  commit as the rename.

## Existing-key decisions (Feature 05.1.3)

Recorded here once instead of re-litigated at every call site:

- **`storage.tier`, `platform.name`, `platform.capabilities`** stay under
  their original, unnamespaced key strings and are documented as
  `ui`-owned diagnostics in `KEY_REGISTRY`, rather than renamed to
  `ui.storageTier`/`ui.platform*`. All three are recomputed fresh every
  boot (never persisted) — renaming them would only touch already-tested
  Phase 03/04 bindings and specs for no behavioral gain.
- **Density stays under `ui.density`**, not moved into `settings.ts`, for
  continuity with Phase 02 — `settings.ts`'s own module comment notes this.
  `ui.theme` and `ui.fontSize` (Phase 22 theme refresh) follow it as its
  Appearance-section siblings, applied to `<html>` imperatively by
  `theme.ts` rather than bound — that file's comment explains why.
- **`strings`** (the static `src/app/strings.ts` copy mirror) is outside
  `KEY_REGISTRY` entirely (`NON_REGISTRY_KEYS`) — it's reference data, never
  a mutation or persistence candidate, seeded once by `seedStrings()`.
- **`activeSource`, `favoriteIds`, `ui.viewState`** (Features 05.6.2,
  05.6.3, 05.5.4) are deliberately **not implemented in Phase 05** — none of
  `playlist.sources`/`activeSourceId`, a favorites snapshot, or a real
  per-view search/group UI exists yet. Implementing these selectors now
  would mean inventing Phase 07/13's data shapes speculatively. Phase 07/13
  add them alongside the real state they join.
- **The typed-action-helper split (05.2.6 vs. 05.9.2)** is one mechanism,
  not two: `src/state/typed.ts`'s `set()`/`get()` is both the typed wrapper
  and the dev-mode bulk-data choke point. A separate `action<T>(name, fn)`
  wrapper around `defineFn` was not built — `defineFn`'s own signature
  already types `(el, state, delta, value)`, and the real payload typing
  problem is solved by exporting a typed function alongside the thin
  `defineFn` wrapper (see `player.actions.ts`'s `setActiveChannel()`).

## Movies/Series/Search catalogs (Phase 21) — decisions and row publication

Three new modules follow every existing convention above (typed key
constants, `KEY_REGISTRY` entries, `set()`/`replace()` discipline, module
memory for anything unbounded) but introduce a few decisions worth
recording once rather than re-discovering per call site:

- **`registry-overflow.ts`**: `registry.ts` was already at eslint's 400-line
  `max-lines` ceiling with zero slack, so the ~20 new `KEY_REGISTRY` entries
  for `vod`/`series`/`search`/the two new `settings.*` language keys live in
  their own file and are merged into `KEY_REGISTRY` via one spread. It has
  stayed full since, so **every new `KEY_REGISTRY` entry goes here**,
  whichever module owns it — that's why the file is named for the role
  rather than the phase that created it.
  `KEY_REGISTRY` itself is still the one object every consumer
  (`persist.ts`, `bulk-policy.ts`, `index.ts`'s `rehydrateState()`) reads —
  this only changes how it's assembled. `KeyMeta.owner`'s union gained
  `'vod' | 'series' | 'search'`. `registry-overflow.ts` itself later hit the
  same 400-line ceiling (the boot splash's `ui.bootPhase`, `boot.ts`) — one
  level deeper, `registry-overflow-2.ts` exists for exactly that reason and
  is spread into `KEY_REGISTRY` the same way. Once a `-2` file exists, add to
  whichever overflow file still has room rather than always reaching for the
  newest one.
- **Catalog payload persistence** (`catalog-storage.ts`): no bulk table in
  `src/core/storage/records.ts`'s `TableName` union fits a VOD/series
  catalog, and adding one means editing `src/core/storage/**`, outside this
  phase's `src/state/`-only scope. Catalog payloads (categories, one
  category's items, one item's detail) persist instead through the small-
  keyed `get`/`set` surface, one storage key per category/detail entry, and
  **only on the `'full'` storage tier** — `'partial'`/`'none'` stay session-
  memory-only (`vod-rows.ts`/`series-rows.ts`'s `createCatalogMemory()`
  instances). See `catalog-storage.ts`'s own header for the full reasoning.
- **No "All" pseudo-category**: `vod/open`/`series/open` auto-select
  whatever ends up first after `catalog-sort.ts`'s country-first sort —
  which *is* the first country-matching category whenever one exists — and
  fall back to the provider's first category otherwise. An "All" entry would
  need one very large, unfiltered `get_vod_streams`/`get_series` call on
  every open; a real category is the cheaper, always-relevant first stop.
- **`ActiveChannelSnapshot` gained one additive field, `kind?: 'live' | 'vod'
  | 'series'`** (`records.ts`) — every snapshot built before this phase omits
  it and reads as `undefined`/television, unaffected. Only `vod.actions.ts`'s
  `playVod()` and `series.actions.ts`'s `playSeriesEpisode()` set it, both
  reusing `player.actions.ts`'s existing `setActiveChannel()` rather than a
  parallel action. Both also close their detail panel on the way out:
  `.catalog-detail` is absolutely positioned over the whole
  `.list-shell__body`, which is where the now-playing pane appears, so
  leaving it open would hide the picture the viewer just asked for behind
  the poster they asked for it from.
- **`sequence-token.ts`**: `selectVodCategory()`/`openVodDetail()` (and their
  series equivalents) need to detect "did a newer call supersede me" after
  an `await`. Re-reading the very key the same call just `set()` moments
  earlier is unreliable — `set()`/`replace()` only queue a write, and
  nothing is visible to `get()` until the next `tick()` (production:
  `run()`'s rAF loop; nothing guarantees one lands between a same-function
  `set()` and a later `get()`). `sequence-token.ts`'s plain in-memory counter
  sidesteps the tick queue entirely; `search.actions.ts`'s `recomputeSearch()`
  uses the same fix (plain module variables for the just-set query/scope,
  never a re-read) for the identical reason.
- **Channel search keys**: `ChannelRow` (`src/m3u/types.ts`) carries no
  pre-normalized search key — adding one is outside this phase's
  `src/state/`-only scope. `search.actions.ts` instead caches
  `normalizeForSearch()` results keyed by row id, invalidated by reference
  identity against `live-rows.ts`'s `liveDisplayRows()` array (which only
  changes reference on an actual rebuild, never per keystroke) — satisfying
  `src/search/README.md`'s "normalize once" contract without a `ChannelRow`
  schema change.
- **A series row's `url` is `''`** (`series-rows.ts`'s `seriesItemToRow()`)
  — a series is a container of episodes, never directly playable; a click
  handler must trigger `series/openDetail`, never reuse a generic play-on-
  click path. A VOD row's `url`, by contrast, is the real playable stream
  URL (`vod-rows.ts`'s `vodItemToRow()`), so it works whether a future click
  handler reuses the generic list-click path or `vod/play`'s own action.
- **Display-name cleaning (`catalog-clean-name.ts`)**: real Xtream
  categories/titles carry a repeated pipe-/bracket-delimited decoration tag
  (`| NL | WK 2026`, `┃NL┃ Show`) on every entry — noise once every
  chip/row in a Movies/Series list shows it. `cleanCatalogDisplayName()` is
  a new, small, pure module living beside the catalog state helpers rather
  than an extension of `src/channels/name-parse.ts`: that module's
  `COUNTRY_PREFIX` strips exactly one leading tag as part of a
  country/quality/recording-flag parse feeding Live/Radio's grouping —
  behavior this must not touch. The catalog cleaner instead strips a
  *repeated* run of tags and nothing else, called only at the display
  boundary — `vod-rows.ts`/`series-rows.ts`'s row/detail builders
  (`vodItemToRow()`/`toVodDetail()`/`seriesItemToRow()`/`toSeriesDetail()`)
  and `vod.actions.ts`'s/`series.actions.ts`'s category-row builders.
  Stored catalog memory and search keys keep the raw name; a category's
  cleaned name cascades into every row's `group` field and every detail's
  `categoryName` for free, since those are looked up once through
  `vodCategoryName()`/`seriesCategoryName()` rather than re-derived from
  the raw `XtreamCategory`.
- **`vod.categories`/`series.categories` publish an accordion, not a flat
  list** (`catalog-category-tree.ts`). A real panel ships the same service
  a dozen times over — `| NL | NETFLIX`, `| FR | NETFLIX`, `NETFLIX`,
  `| NL | NETFLIX KIDS`, `| US | NETFLIX BLACK LEAD` — and once the tag
  stripping above has run, several of those rows read as the identical
  word. So the rail lists one head per *service* (the viewer's own country
  when the provider has one), and folds the rest behind an expand triangle,
  each labelled by what makes it different (`FR`, `KIDS`, `US · BLACK
  LEAD`). Which heads are open is module memory on the rail instance in
  `vod-rows.ts`/`series-rows.ts`, not a Spektrum key: the published row
  array is recomputed from it anyway, so a second key would only be a
  second thing to keep in sync. Two consequences worth knowing before
  reading `vod.categories` for anything else — a collapsed variant is
  **absent** from it, and an expanded one carries a *shortened* label. The
  rail's own `displayName()` (through `vodCategoryName()`/
  `seriesCategoryName()`) is the only correct way to ask what a category is
  called.
- **`series.detail.rows` replaces a nested `seasons[].episodes[]`
  structure**: Spektrum's `data-each` clones an element's own *first
  element child* into its container, so a season block that itself carries
  `data-each` (the original markup) treats its nested episode-list as a
  static sibling that only binds once, never rebinding per season — the
  literal `{{ }}` episode lines a user reported. `series-rows.ts`'s
  `buildSeriesDetailRows()` flattens seasons/episodes into one ordered
  `SeriesDetailRow[]` (season-header rows and episode rows interleaved,
  `series.ts`) so the panel can use a single-level `data-each` + `data-if`
  per row kind — the same pattern every other list in the app already
  uses. `durationMins` is rounded when the row is built, never via
  `Math.round()` inside a `{{ }}` expression (the evaluator has no
  guaranteed access to `Math` beyond incidental global scope-chain
  fallthrough — not worth relying on).
- **`series.detailStatus`/`series.detailErrorReason`**: the open series'
  own `get_series_info` fetch status, distinct from `series.status` (the
  *category* list's — reusing it would hide the whole detail overlay on a
  failed detail fetch, since `series.status === 'ready'` also gates
  `list-shell__body`). `openSeriesDetail()` previously left a failed fetch
  completely silent — the panel kept showing its immediate partial
  snapshot with zero episodes, indistinguishable from a series that
  genuinely has none. Every code path through `openSeriesDetail()` now
  resolves this pair to something the panel can show: `'loading'` while in
  flight, `'error'` + `'no-source'`/`'fetch-failed'` on a real failure with
  nothing to fall back on (driving a classified message + a Retry button
  that re-dispatches `series/openDetail`), or `'ready'` — including when a
  failure still had a stale cached result to fall back on, since slightly
  stale episodes beat an alarming error the user can't act on.

### Row publication — which action feeds the shared virtual list

Every catalog/search row set reaches the DOM through the same
`state/list-rows.ts` choke point every other channel list already uses
(`setDisplayedRows()`) — no second row surface, no second selection cursor:

| View                        | Publishing action(s)                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Movies (a selected category)| `vod.actions.ts`'s `selectVodCategory(id)` (called by `vod/open`'s auto-select, and directly by `vod/selectCategory`) |
| Series (a selected category)| `series.actions.ts`'s `selectSeriesCategory(id)`, same pattern      |
| Search results (any scope)  | `search.actions.ts`'s `setSearchQuery()`/`setSearchScope()`, via the internal `recomputeSearch()` — also exported directly for the UI stage to force a re-publish (e.g. after a catalog fetch completes) |

One deliberate non-goal: a currently-open series' episode list does **not**
go through `setDisplayedRows()`. `series.detail.rows` (the flattened
season-header/episode row array — see "`series.detail.rows` replaces a
nested `seasons[].episodes[]` structure" above) is already bounded
(`SERIES_DETAIL_EPISODES_CAP`) and belongs to exactly one open series, so
the UI stage should template it directly off `series.detail` rather than
route a small, fixed list through virtual-list windowing built for a
90k-row catalog.

One known, harmless side effect: `setDisplayedRows()` also invalidates/saves
the shared `list.selectedId` cursor into the active source's `ui.listState`
entry (`list-state-sync.ts`), same as every other view that calls it. A
Movies/Series/Search selection can therefore overwrite that per-source
entry's `selectedId`; returning to Live self-heals via `setDisplayedRows()`'s
own "selected id absent from the new row set → fall back to the first row"
rule, so this was left as-is rather than threading a per-view exception
through `list.actions.ts` (out of this phase's scope).

### Background full-catalog warm (`catalog-warm.ts`/`vod-warm.ts`/`series-warm.ts`)

`get_vod_streams`/`get_series` called with **no** `category_id` return the
ENTIRE catalog in one request — the same quirk `client.ts` already documents
for `getLiveStreams()`. `warmVodCatalog()`/`warmSeriesCatalog()` (plus the
combined `warmCatalogs()`, `warm.ts`) use this once per 24h TTL so
`search`'s `movies`/`series`/`all` scopes can honestly cover every category,
not only whichever ones the user happened to open via `vod/selectCategory`/
`series/selectCategory`. **These functions are exported but never
self-triggered** — no timer, no interval, nothing wired in `src/state/`; the
app layer calls them (after first paint, on a Movies/Series tab open, etc.).

- **No-op conditions**, each reported through `vod.warmStatus`/
  `series.warmStatus` (`'idle' | 'warming' | 'warmed' | 'skipped'`, never
  persisted — recomputed every session): the storage tier isn't `'full'`,
  the previous warm (module memory or, after a reload, the storage-cached
  warm-meta marker) is still within the 24h TTL, there's no active
  fully-credentialed Xtream account, the fetch failed, or the
  `WARM_ROW_CAP` (100,000 rows) sanity cap was exceeded. Every "didn't run"
  reason besides freshness reports `'skipped'` — the distinction between
  "wrong tier" and "provider dump too large" isn't worth a second flag; a
  future UI surfacing this can treat both as "still browsing lazily."
- **The sanity cap** discards the *entire* warm result (publishes nothing,
  touches no memory/storage) rather than truncating it — a dump that large
  reads as the provider quirk returning something degenerate, not a normal
  catalog worth partially trusting.
- **Reload survival**: warming persists a small `{fetchedAt, categoryIds}`
  marker (`catalog-storage.ts`'s `StoredWarmMeta`) separately from the
  per-category item keys it already writes. A fresh warm attempt after a
  reload (module memory empty) checks this marker first — if still within
  TTL, `rehydrateWarmedCatalog()` reloads the category list and every
  category's items back into memory from the existing full-tier storage
  keys (local reads only, bounded by category count), rather than
  re-fetching over the network.
- **`catalog-warm.ts`** is the shared, parameterized core (same shape as
  `catalog-memory.ts`/`catalog-sort.ts`/`catalog-storage.ts`) — `vod-warm.ts`/
  `series-warm.ts` stay thin wrappers around their own network call.
- After a successful warm (fresh fetch or rehydrate), the active category's
  `vod.count`/`series.count` is recomputed and `search.actions.ts`'s
  `recomputeSearch()` is re-run (a no-op if no query is active) — so
  `search.loadedOnly` drops to `false` immediately rather than waiting for
  the next keystroke.
- Concurrency: a plain in-flight boolean per catalog (matching
  `vod.actions.ts`'s existing `openInFlight` pattern) guards a double-warm;
  a `sequence-token.ts` instance was not needed here since there is only one
  warm attempt per catalog to protect, not a rapid sequence of
  user-triggered ones.

### Movies/Series rail visibility (`settings.nav.movies`/`settings.nav.series`)

Added through the exact existing mechanism, unchanged: two more
`settings.nav.*` keys (default **on**, `settings.ts`), two more entries in
`settings.actions.ts`'s `TOGGLEABLE` allowlist (`'nav.movies'`/`'nav.series'`,
both routed through the same generic `settings/toggle` action every other
rail checkbox already uses), and two more entries in `ui.selectors.ts`'s
`RAIL_TOGGLES` array — which is what actually registers
`rail.movies.visible`/`rail.series.visible` (no new selector-registration
code was needed, the existing loop just grew two rows). The "a hidden rail
entry still shows while its own view is active" rule applies to these two
automatically, once the other agent's `src/app/router.ts` change adds
`'movies'`/`'series'` to the `Route` union — nothing here depends on that
union directly (the comparison is a plain string match), so no coordination
was required to land this half first.

## Downloading a movie or an episode (`downloads.ts`/`downloads.actions.ts`)

Movies and TV episodes, never live channels. Both VOD shapes
(`/movie/{user}/{pass}/{id}.{ext}` and `/series/{user}/{pass}/{id}.{ext}`)
are static files with a real `Content-Length` and a real end; a live channel
is an endless transport stream with neither, so there is nothing to download
*to*. Both ride one queue through the shared `enqueue()`; the callers differ
only in where the title and extension come from. The platform half (the
`DownloadAdapter`, the `managed`/`handoff` capability, and why `prepare()`
is separate from `start()`) is in `src/core/platform/README.md`.

An episode's extension comes off `series.detail.rows`, which is why
`SeriesDetailRow` carries `containerExtension` and `season` at all: the save
picker needs the filename synchronously, inside the click, and awaiting a
`get_series_info` round trip would spend the click's user activation first.
`download.episodeRows` (`downloads.selectors.ts`) is the download-joined copy
of those rows the episode list actually binds — a flat `data-each` row cannot
look itself up in `downloads.items`, so the join happens in a selector, and
the dependency points the right way (downloads knows about series, not the
reverse).

Three decisions worth recording once:

- **The queue lives in module memory, and state is a projection of it.**
  This looks like it contradicts "state is the single source of truth", and
  it is the same finding `sequence-token.ts` already records: `set()` only
  *queues* a write, and nothing is visible to `get()` until the next
  `tick()` — which nothing guarantees lands between an enqueue and the
  `pumpQueue()` call right after it. A runner re-reading its own just-written
  state sees an empty queue and never starts. So `queue`/`activeId` are
  plain module variables and `publish()` mirrors them into
  `downloads.items`/`downloads.activeId` for rendering. That also keeps the
  live `DownloadHandle` — a function-bearing object — out of a store that
  should only ever hold serializable snapshots. `publish()` rebuilds the
  array and every entry object each time, since Spektrum diffs by reference
  and an in-place mutation would never look changed.
- **One transfer at a time.** Not a simplification: Xtream panels cap
  concurrent connections per account, which is the same limit that makes
  "downloading while watching" fail. Parallel transfers would trade a queue
  that finishes for a set that all die at once. It is also why the movie
  detail panel disables *Play* while its own download runs — starting
  playback opens a second connection to the same account.
- **Progress is coalesced to 250 ms** in `downloads.actions.ts` (and again in
  `desktop/main.mjs`). The web adapter reports once per network chunk, which
  on a fast link is far more often than a bar can redraw, and every one of
  them would republish the whole queue array.

### Two Spektrum gotchas this feature hit

Both cost a debugging round, and both will bite the next feature that
touches markup:

- **`data-if` does not stop an element's other bindings from evaluating** —
  it only toggles `display`. A hidden `<progress :value="download.detail.percent">`
  still ran while no movie was open, assigned `undefined` to
  `HTMLProgressElement.value`, and threw. Anything bound to a *numeric DOM
  property* needs a selector that is always finite (`download.detailPercent`),
  never an optional-chained path.
- **`data-each` wants a plain path, not an expression.**
  `data-each="download.rows || []"` silently rendered zero rows;
  `data-each="download.rows"` works. Keep the fallback in the selector (it
  already returns `[]`), not in the template. This was not hypothetical: the
  series episode list shipped as
  `data-each="series.detail?.rows || []"` and rendered **nothing** — the
  panel looked like every series had zero episodes. `series-detail.markup.spec.ts`
  did not catch it because that spec mirrors the markup by hand and happened
  to use the plain-path form. When mirroring markup in a spec, copy the
  binding verbatim.

## Browsing offline, and why a stale cache is now used

`catalog-storage.ts` has always persisted categories, a category's items and
a movie's detail (full storage tier only). What it did *not* do was **use**
them once they aged out: every read was memory → storage-**if-fresh** →
network, so a cache older than `CATALOG_TTL_MS` was skipped entirely and a
failed refresh produced an error screen with a complete catalog sitting
unused in IndexedDB.

Now the stored copy is adopted regardless of age, and only the *refresh*
decision still consults the TTL:

- refresh succeeds → fresh data, `stale = false`
- refresh fails **with** a cache in hand → keep the cache, `stale = true`
- refresh fails **with nothing** cached → `status = 'error'` as before

`vod.stale`/`series.stale` drive one line of copy (`strings.catalog.offline`)
so the viewer is told where the data came from rather than being shown
yesterday's catalog as if it were live. Detail payloads (`get_vod_info`,
`get_series_info`) skip the freshness gate entirely on the read side — a
plot, a running time and a season/episode list do not go stale the way a
category listing does, and offline they are the only version there is.

This is a **full-tier feature**, by design: `catalog-storage.ts` refuses to
persist a multi-thousand-item catalog into `localStorage`, so a `'partial'`
or `'none'` tier still fails honestly rather than half-working.

### Replaying a Starred or Recent entry

`favorites.actions.ts`'s `playFavorite()` and `recent.actions.ts`'s
`playFromHistory()` both play from a stored snapshot and then hand off to
`showReplayedChannel()`, which is where the three things that make it
*visibly* work live:

1. **The router must not stop it.** `applyRoute()` stops playback on every
   route change; a replay navigates *because* something just started, so it
   arms a one-shot, route-matched exemption
   (`player.actions.ts`'s `keepPlaybackThroughRoute()` /
   `isPlaybackHandoff()`). Without it the channel was already dead by the
   time the tab painted — the whole of "it switches tab and nothing happens."
2. **The row has to be on screen.** `revealRowOnNextPublish()` queues the id
   for the target view's arrival republish (which resets the scroll to the
   top), consumed once by `setDisplayedRows()`.
3. **The row may wear a different id.** Live keys each row on its *primary*
   feed, so an entry captured elsewhere resolves through that row's
   `variants` (`list-rows.ts`'s `rowIdFor()`) before the cursor gives up and
   falls back to the first row.

## The shared list has to be republished on every view switch

Live, Categories, Movies, Series and Search all publish into **one** virtual
list (`setDisplayedRows()`), so whichever view you switch *into* must
(re)publish or the previous view's rows just stay on screen.
`live.actions.ts`'s `publishRowsForCurrentView()` does this for the
channel-list views but knows nothing about the catalogs, and
`catalog-activation.ts`'s one-shot-per-session guard meant Movies/Series
never republished after their first open — so opening Movies, then TV Shows,
then Movies again left the TV Shows list sitting under the Movies tab.

The guard itself is still right (`openVodCatalog()` re-runs "auto-select the
first category", which would throw away a drill-down on every tab switch), so
re-entry calls `republishVodRows()`/`republishSeriesRows()` instead: module
memory only, no fetch, no auto-select, returning `false` when there is
nothing cached so the caller can fall back to a real open.

**Any future view that publishes into the shared list owes the same
republish-on-entry.**

## EPG country catalog (Phase 31) — decisions worth recording once

`epg-load.ts` (rewired), `epg-settings.ts`/`epg-settings.actions.ts` (new)
sit on top of `src/epg/**`'s pure/storage-touching modules — see
`src/epg/README.md` for the pipeline itself. What's specific to the state
layer:

- **`src/epg/match.ts` keeps its own synchronous mapping cache**, outside
  `KEY_REGISTRY` entirely — `live-rows.ts`'s `ensureLiveRows()` is a
  synchronous hot path (same "bulk data bypasses Spektrum state" rule as
  `m3u/channel-memory.ts`) and cannot `await` a storage read on every
  rebuild. `saveMapping()` keeps the cache current; `epg-load.ts`'s
  `primeEpgMapping()` restores it from storage once at boot, called
  alongside `loadGuideChannels()`, before `live-rows.ts` ever needs it for
  real. `getMappingSync(country)` is the one sanctioned synchronous reader.
- **`groupChannels()` gained `epgMatches`/`epgVerifiedOnly`, not the phase
  plan's literal `epgKnownKeys: Set<string>`.** A `Map<channelKey,
  catalogId>` is a strict superset — membership works identically, and the
  value doubles as `GroupedChannel.epgId` for row enrichment (Phase 17's
  future now/next span) in the same pass, instead of a second lookup.
  `live-rows.ts` builds this map from `getMappingSync()` on every
  `ensureLiveRows()` call; it is not itself a Spektrum value.
- **`loadDefaultEpg()` re-matches on every call, not only when a feed was
  actually fetched.** Matching is cheap (<50ms even for a large country,
  Feature 31.5.7) and a newly-imported playlist needs to see EPG matches
  immediately, even while the feed itself is still inside its 12h TTL
  window — otherwise a fresh import would show zero EPG data until the
  next scheduled fetch.
- **`epg-load.ts` calls `refreshLiveRows()` (from `live.actions.ts`)
  directly** after a fresh match, and `clearEpgCache()` does the same —
  the one exception to "state modules don't call each other's actions"
  elsewhere in this codebase, justified because Live's cache has no other
  way to learn "the mapping changed" (Feature 31.6.9). No import cycle:
  nothing `live.actions.ts` transitively imports reaches back into
  `epg-load.ts`.
- **The Live-filter country prefix (`groupChannels({country})`) is
  deliberately NOT applied when building the channel list `matchChannels()`
  sees.** The EPG catalog is already scoped to one country per run, so it's
  the only boundary that needs to hold; reusing the "| NL |"-prefix filter
  on the channel side too would silently exclude legitimate channels a
  provider didn't prefix, for no matching benefit (see `epg-load.ts`'s own
  comment at the call site).
- **`settings.liveEpgVerifiedOnly` reuses the exact `strictFellBack`
  never-empty-screen pattern** (`live.ts`'s `epgFellBack` field,
  `live-rows.ts`'s fallback branch) rather than inventing a second
  mechanism — a catalog that hasn't matched anything yet is far more often
  "not fetched" or "wrong country" than "every channel genuinely lacks
  guide data."

## The persistence bridge, in one paragraph

Actions call `persist(key)` after a `setValue`/`set()` write. `persist()`
throws in dev if `key` isn't marked `persisted` in the registry — a typo
fails at the call site, not silently. A 500ms debounce (`src/state/persist.ts`)
coalesces every key dirtied in that window into one `storage.setMany()`,
wrapped per key in the Feature 04.9 version envelope (`{ v, data }`). A
failed flush re-marks its batch dirty and retries on the next window —
never a hot loop, never thrown into an action. `registerPersistOnHide()`
forces a best-effort flush on `visibilitychange`/`pagehide` so closing the
tab right after a mutation still persists it.

## `setValue()` merges object values — it does not replace them (Feature 08 finding)

Discovered the hard way while building the Phase 08 favorites/list-state
maps: Spektrum's `setValue(path, value)` **deep-merges** an object-valued
`value` onto whatever is already at `path`, rather than replacing it.
Verified directly against the vendored engine:

```ts
setValue('probe.map', { a: 1, b: 2 });
tick();
setValue('probe.map', { a: 99 });
tick();
// appState.probe.map is { a: 99, b: 2} — "b" survived, even though the
// second write never mentioned it.
```

Array values are unaffected — the engine's own merge function explicitly
excludes arrays, so `list.visibleRows`/`list.groups`/etc. always replace
cleanly. The hazard is specific to `Record<string, T>`-shaped state (a map
you sometimes need to *shrink* a key out of): `favorites.ids` removing a
favorite, or `ui.listState` evicting a source past its LRU cap
(`state/list-state.ts`'s `upsertListState()`). A `delete` on the JS object
before calling `set()` looks correct and compiles fine, but the removed key
silently reappears in live state because `set()` merges the smaller object
back onto the larger one still sitting in `appState`.

**The fix, `state/typed.ts`'s `replace()`:** reset the path to `undefined`
and drain that with one explicit `tick()` before writing the real
(possibly-smaller) value — confirmed this forces a true replace instead of a
merge. `favorites.actions.ts`'s toggle-off path and `list-state-sync.ts`'s
`saveListState()` both use `replace()`, never `set()`, for exactly this
reason; `set()` remains correct and cheaper for every write that only adds
or updates keys (the favorite-on path, `upsertListState()`'s own per-source
patch). Calling `tick()` from application code is otherwise unheard of in
this codebase (production always relies on `run()`'s rAF loop to drain) —
`replace()` is the one sanctioned exception, confined to `state/typed.ts`.

**Any future phase adding a removable-key `Record<string, T>` to Spektrum
state must use `replace()` for the removal path, not `set()`.** Phase 13
(Favorites/Recent) and Phase 15 (Multi-playlist Management) are the most
likely next places this matters.

## Boot order (masterplan §6.4)

`src/app/bootstrap.ts`, in order: `createPlatform()` → `setPlatform()` →
`initState()` (seed every module's defaults) → `rehydrateState()` (overwrite
only the keys with a real, envelope-valid stored value — `KEY_REGISTRY`'s
`persisted` set drives the `getMany` list automatically) → `seedStrings()` →
register actions/selectors → `initRouter()` → `bindDOM()`/`run()`. Only
*after* the restored session is rendering does `void loadActiveSource()`
(the heavy playlist path, stubbed until Phase 06) start — never awaited, so
a slow parse can never delay first paint.

## First-run setup wizard (`wizard.ts`/`wizard.actions.ts`)

`ui.wizardOpen` is set by `wizard.actions.ts`'s `openWizardIfNoSources()`,
called from `bootstrap.ts` right after `loadPlaylistSources()` resolves (not
before — `playlist.sources` is a live storage projection, empty by default
until that load actually completes, so checking any earlier would flash the
wizard open for every returning user for one frame). The "should it open"
decision itself is a pure function, `wizard.ts`'s `shouldOpenWizard()`
(`!setupComplete && sources.length === 0`), unit-tested without touching
Spektrum state.

The `setupComplete` half is the *durable* answer, and the reason a
configured install is never asked twice: `ui.setupComplete` is a persisted
key, so it is rehydrated before the boot check runs. `markSetupComplete()`
(idempotent, writes at most once) sets it when the wizard saves an account,
when the user skips/closes it, and when boot finds a source already
configured — that last one is also how an install predating the flag, or
one set up through the Connect card instead of the wizard, gets it written.
An empty `playlist.sources` on a later boot (a demoted storage tier, a
deleted source, a cleared table) therefore no longer re-triggers the
wizard; `wizard/open` in Settings → Streaming remains the way back in.

The wizard's two steps reuse existing settings rather than inventing
parallel ones: step 1's language/country `<select>`s are wired to the exact
same `settings/setLocale`/`settings/setLiveCountry` `data-fn`s the Settings
panel's own controls use, and step 2's Xtream form calls
`settings.actions.ts`'s `saveXtreamAccount()` directly through a thin
wrapper (`wizard/saveXtreamAccount`) that only adds closing the wizard on a
successful save. `wizard/open` (bound to a "Run setup wizard again" link in
Settings → Streaming) is the sole manual reopen path, so the wizard is never
a one-shot dead end.

## Bulk-data bypass rules (Feature 05.8)

Anything that can exceed ~1000 items (`MAX_RECORDED_COLLECTION`, in
`bulk-policy.ts`) never becomes a Spektrum value: it lives in module memory
(`src/m3u/channel-memory.ts`'s `allRows`, once Phase 06 lands) and in
storage's bulk tables (`src/core/storage/README.md`'s "two surfaces"),
publishing only compact, capped derived slices into state (zap history ≤ 20,
a visible window ≤ ~40 rows, etc. — each ceiling recorded as the key's own
`maxItems` in `KEY_REGISTRY`). The documented pipeline for a chunked import:

```
worker parses a chunk
  → writeChunked() persists the chunk to storage's bulk tables
  → the chunk is appended to channel-memory.ts's allRows
  → exactly one playlist/importProgress action fires per chunk
     (a compact { written, total } counter — never row data)
```

`src/state/typed.ts`'s `set()` calls `assertCompact(key, value)` in dev on
every write — an array payload over the key's registered `maxItems` (or the
1000 global default for an unregistered key) logs one warning and does
nothing else; it never throws, so a bug here is loud in development and free
in production. See `src/core/storage/README.md` for the storage-tier half of
this contract.

## Time-travel policy (Feature 05.7)

`history-policy.ts` caps Spektrum's recorded history at 200 entries in dev
and trims it to 0 after every mutation in prod (behaviorally disabled — the
closest supported mechanism to the pinned `spektrum@1.1.0` singleton, which
has no runtime `historyLimit` setter; see the file's own comment for why a
full switch to `createSpektrum()` wasn't worth it for this one policy).
`devtools.ts` exposes `window.__tl.replay(n)`/`__tl.dumpState()`, imported
only behind `if (import.meta.env.DEV)` in `bootstrap.ts` so it tree-shakes
out of `dist/`.

**Reproducing a state bug in dev:** open the console, trigger the buggy
sequence, then call `__tl.dumpState()` to inspect the full manifest
(`state`, `cursor`, `historyLength`, registered `fns`, …) or `__tl.replay(n)`
to scrub back to history index `n` and step forward again. This only works
in dev — a prod build has nothing to replay by design, so a bug report from
production needs to be reproduced locally first.

## Testing

- Unit specs sit beside their module (`player.actions.spec.ts`,
  `persist.spec.ts`, …), using `FakePlatform`/`withFakePlatform` for
  anything touching storage, exactly like the platform/storage layers.
- `src/shared/testing/bind-dom.ts` is the shared bindDOM harness (Feature
  05.10): `mountTemplate(html)` runs a fresh seed-then-bind mount;
  `mountAfterBoot(html)` additionally rehydrates first, for specs proving
  the restored-session-renders-before-heavy-load promise. Both return
  `query`/`queryAll`/`dispatch`/`cleanup`. `dispatch(fnName, value)` clicks
  a `[data-fn="fnName"]` element already present in the mounted markup —
  it does not synthesize one, and `value` can only carry what Spektrum's
  own `data-value` coercion supports (boolean/number/string, never a
  structured object); specs needing a full payload (e.g. a channel
  snapshot) call the exported action function directly instead, per
  Feature 05.2.7's "actions are plain, synchronous, directly callable
  functions."
