# Phase 31 — EPG Country Catalog (Vision 3.0 stepping stone)

> **Epic goal:** Derive a per-country canonical channel catalog from the
> `globetvapp/epg` XMLTV feeds — politely fetched, locally stored, offline
> thereafter — and use it as an identity source to filter and name the Live
> channel list, replacing the hand-maintained curated catalog as the *only*
> way ThunderTV knows which channels are real.
> **Verification:** With a Dutch Xtream playlist imported and country = NL:
> the app downloads the Netherlands feeds at most once per 12 h TTL window
> (gz variant, sequential, conditional GET honored — assert via a logged/
> mocked fetch trace in tests); Settings shows a country picker sourced from
> the checked-in registry; toggling "EPG-verified channels" filters Live to
> channels matched against the stored catalog with the filter readout
> explaining the drop counts; pulling the network after one successful fetch
> changes nothing on reboot (catalog and matches serve from storage);
> `npm run verify` (typecheck, ESLint, tests incl. the storage matrix over
> the new store, reachability gate, budget gate) is green.

Before this phase, EPG knowledge is two hardcoded Netherlands URLs
(`src/epg/xmltv.ts`) matched by exact tvg-id/name equality, consumed only by
the Guide timetable; the Live view's notion of "a real channel" is the
hand-curated `DUTCH_CATALOG`. After this phase, ThunderTV has a **country
registry** (which countries exist upstream, their feed files, and their
channel-id suffix), a **stored per-country catalog** of canonical channel
identities derived from those feeds, and a **matcher** that binds imported
playlist rows to catalog entries — feeding both the Live filter and the
existing Guide ingestion from one download. This is the Vision 3.0 on-ramp:
the catalog entry is the first entity that is *not* a parsed M3U line
(stone 1), it lives in indexed storage (stone 2), and the matcher is the
resolver's v0 (stone 5). Timetable UX (stone 7), health (stone 3), and the
Codex file format (stone 4) build on this and are **out of scope here** —
see "Scope fences" below.

---

## Verified upstream facts (checked 2026-07-29 — do not re-derive)

The plan below is written against the real `globetvapp/epg` repository:

- **136 top-level folders**, capitalized, one word: `Netherlands`, `Usa`,
  `Unitedkingdom`, `Germany`, `Belgium`, `Czech`, `Southafrica`, … Most are
  countries; a few are pseudo-regions (`Sports`, `Caribbean`, `Scotland`).
- **Files per folder:** `<folder-lowercased><n>.xml` starting at 1, no gaps.
  Netherlands has 2, Usa has 6 (`usa7.xml` → 404). Every `.xml` has a
  **`.xml.gz` twin** — `netherlands1.xml` is 2 441 047 bytes plain,
  **179 385 bytes gzipped (13×)**. Always fetch the `.gz`.
- **raw.githubusercontent.com serves strong ETags** — conditional GET
  (`If-None-Match` → 304) works and must be used.
- **Channel ids are human-readable names with a country suffix**, *not*
  slugs: `24 Kitchen.nl`, `100% NL TV.nl`, `1-2-3.tv.de`, `BINGETV.us`,
  `4Seven HD.uk`, `13eRue.be`. The `<display-name>` is the *same string
  including the suffix* — display names must be derived by stripping the
  suffix, and normalization must run on our side. Note `1-2-3.tv.de`:
  ids contain dots, so only the *registered* suffix may be stripped, only
  at the end.
- **Suffixes are mostly ISO 3166-1 alpha-2 but not always** (`uk`, not
  `gb`) — they must live in the registry, never be derived from the folder
  name or from ISO codes.
- **Feeds contain junk and micro-channels too** (`Babes TV.nl`,
  `AA en Hunze TV.nl` and ~370 NL entries): catalog membership means "this
  is a known broadcaster in this country," not "worth showing." The junk
  filter and curated ranking still apply on top.
- Feeds refresh upstream once daily at 03:00 UTC. The existing 12 h TTL
  (`XMLTV_REFRESH_TTL_MS`, `src/state/epg-load.ts`) is the right cadence.

## Scope fences

- **In:** country registry + generator script, polite gz/conditional
  fetching, catalog derivation + storage, playlist↔catalog matcher, Live
  filter/naming integration, Settings country picker + verified-only toggle
  + manual refresh, rewiring the existing Guide ingestion onto the same
  pipeline, program pruning.
- **Out (next slices):** any timetable/Guide *UI* change (stone 7), channel
  row now/next enrichment (Phase 17), stream health (stone 3), Codex
  export format (stone 4), multi-country simultaneous selection, non-Live
  surfaces (Movies/Series), the XMLTV *worker* + streaming tokenizer from
  Phase 16 (the channels-only parse this phase needs is small; revisit when
  full-programme ingestion for big countries lands).

## Standing constraints (repo law — check before coding, not after)

- All HTTP through `getPlatform().http` (`src/core/http/README.md`); all
  storage through `getPlatform().storage`; no `fetch`/`indexedDB` outside
  `src/core/` (ESLint-fenced).
- Spektrum writes only inside `src/state/**`; every new key registered in
  `src/state/registry-keys.ts` **and** the ownership table in
  `src/state/README.md`, same commit.
- All UI copy via `src/app/strings.ts` (en + nl + de, all three, same
  commit); new `data-fn` actions must pass `scripts/check-reachability.mjs`.
- Files ≤ 300 lines (hard 400); no CSS transitions/animations; bundle
  budget gate must stay green (registry data ships lazy, see 31.9).

---

## Feature 31.1 — Country registry (the local mapping file)

One checked-in, data-only module answering: which countries exist upstream,
what are their feed files, what suffix do their channel ids carry, and how
are they presented — so runtime never probes, guesses, or string-derives any
of it. This is the "mapping file" for lookups and consistent presentation.

- [ ] **31.1.1** Record shape — define `EpgCountry { folder, filePrefix, fileCount, suffix, iso2, name, kind: 'country' | 'region' }` in `src/epg/countries.ts` (`iso2` empty and `kind: 'region'` for `Sports`/`Caribbean`/`Scotland`; `suffix` is the observed id suffix, e.g. `uk` for Unitedkingdom — never assume it equals `iso2`).
- [ ] **31.1.2** Generator script — add `scripts/generate-epg-countries.mjs` (dev-time, Node): list folders via the GitHub contents API, probe file counts (`HEAD` `<prefix><n>.xml` until 404), sample each folder's first `<channel id>` to read the actual suffix, and emit the sorted data array into `countries.ts` between `// GENERATED` markers.
- [ ] **31.1.3** Generator politeness — sequential requests with ≥ 300 ms spacing and a `Range: bytes=0-2000` header for the suffix sample; abort with a clear error (leaving the file untouched) on rate-limit responses. This script is run by a developer occasionally, never by the app.
- [ ] **31.1.4** Display names — carry the English display name in the record (`Usa` → `United States`, `Unitedkingdom` → `United Kingdom`, `Southafrica` → `South Africa`, …); the folder string is never shown to a user.
- [ ] **31.1.5** Country-token bridge — pure helpers `countryForLiveToken(token)` / `liveTokenFor(country)` mapping the existing `settings.live.country` token (`'NL'`, matched against `| NL |` prefixes — see `SETTINGS_LIVE_COUNTRY` in `src/state/registry-keys.ts`) to a registry entry via `suffix`/`iso2`, so one user choice drives both the playlist country filter and the EPG feed selection.
- [ ] **31.1.6** Lookup helpers — `findCountry(idOrSuffixOrFolder)`, `feedUrls(country): string[]` (built from one `RAW_BASE` constant + folder + prefix + 1..fileCount + `.xml.gz`), and `stripCountrySuffix(id, country): string` (strip a trailing `.<suffix>` case-insensitively, only when present — `1-2-3.tv.de` → `1-2-3.tv`).
- [ ] **31.1.7** Lazy data — the 136-entry array must not enter the boot bundle: `countries.ts` is imported only via dynamic `import()` from the fetch pipeline and the Settings view module; verify with the budget gate.
- [ ] **31.1.8** Netherlands-first seed — commit the generator's real output for all 136 folders; hand-verify the NL, BE, DE, UK, US rows against the upstream repo in the phase notes.
- [ ] **31.1.9** Unit tests — `countries.spec.ts`: suffix stripping (dot-bearing ids, suffix absent, case), token bridge round-trips, `feedUrls` shape for fileCount 1 and 6, region entries excluded from country pickers.
- [ ] **31.1.10** Regeneration doc — a comment block atop `countries.ts` + a line in `src/epg/README.md`: how to re-run the generator, what changes it may produce (fileCount drift), and that runtime never calls the GitHub API.

## Feature 31.2 — Polite feed fetching

One module owns every byte fetched from the EPG repo: gz-first, conditional,
sequential, TTL-gated, and quiet on failure. A user reloading five times in
an hour must produce zero upstream requests.

- [ ] **31.2.1** Binary http surface — extend the `src/core/http` adapter with an `arrayBuffer()`-capable response path (respecting the existing `maxBytes` guard), since gz payloads can't go through `text()`; contract-test it alongside the existing surface.
- [ ] **31.2.2** Fetch module — `src/epg/feed-fetch.ts`: `fetchCountryFeeds(country, { force })` iterating `feedUrls()` **sequentially** with a ≥ 300 ms inter-file delay (test with fake timers), never in parallel.
- [ ] **31.2.3** gz decode — decompress via `new DecompressionStream('gzip')` gated on a capability check; when unavailable (old webOS), fall back to fetching the plain `.xml` URL instead — no inflate library in this phase.
- [ ] **31.2.4** Magic-byte guard — decide gz-vs-plain by the `0x1f 0x8b` prefix, not by URL or `Content-Type` (a proxy may transparently decode; masterplan 16.2.6's double-decompression guard, implemented here).
- [ ] **31.2.5** Conditional GET — persist `{ etag, lastFetchedAt }` per feed URL under a small kv key (e.g. `epg.feed.<url-hash>`); send `If-None-Match`; a 304 counts as fresh and skips parsing entirely.
- [ ] **31.2.6** TTL gate — reuse the 12 h TTL policy from `epg-load.ts`, but per country; `force` bypasses it (wired to the manual refresh in 31.7); a failed file is skipped until the next TTL window — no retry loops, no backoff storms.
- [ ] **31.2.7** Single-flight — a second `fetchCountryFeeds` call while one is in flight awaits the same promise; reloading mid-fetch must not double-download.
- [ ] **31.2.8** Preconditions — nothing is fetched when no playlist has been imported (no channels to match) or when no country is selected; assert both in tests.
- [ ] **31.2.9** Failure taxonomy — classified failures (`src/core/http`'s kinds) surface as a non-blocking one-line notice via the strings module; a dead feed never blanks the Guide or Live view (previously stored data keeps serving).
- [ ] **31.2.10** Politeness spec — `feed-fetch.spec.ts` proves, with a recorded mock-fetch trace: gz URL chosen, sequential order + spacing, ETag sent on refetch, 304 short-circuits, TTL suppresses, `force` overrides.

## Feature 31.3 — Catalog derivation

Turn fetched feeds into canonical channel identities: suffix-stripped
display names and normalized match keys, deduplicated across a country's
files. Pure functions, no I/O.

- [ ] **31.3.1** Channels-only parse — `src/epg/catalog.ts`: derive catalog entries from a parsed `XmltvDocument` (reuse `parseXmltvDocument`); the same parsed document must also feed program storage (31.8) — **one download, one parse, two consumers**.
- [ ] **31.3.2** Entry shape — `EpgCatalogEntry { country, id, displayName, normKey, sourceFile }` where `id` is the feed's own channel id (unchanged — it is the join key for programmes and the future Codex), `displayName` = `stripCountrySuffix(id)`, `normKey` = shared normalizer output.
- [ ] **31.3.3** One normalizer — reuse `normalizeKey` from `src/channels/name-parse.ts` (import the pure function; do not fork a second spelling of normalization — stone 5 depends on both sides normalizing identically).
- [ ] **31.3.4** Cross-file dedup — union a country's N files by `id` (files 1..N overlap); first occurrence wins, `sourceFile` records provenance for diagnostics.
- [ ] **31.3.5** Collision policy — two distinct ids can share a `normKey` (`SBS 6.nl` / `SBS6.nl`); keep both entries, and let the matcher (31.5) treat the set of ids per normKey as one identity group — document this as the deliberate stone-1 seam.
- [ ] **31.3.6** Icon carry — when the feed's `<channel>` has an `<icon src>`, keep it on the entry (nullable) as a logo-fallback candidate for later phases; never fetched at derivation time.
- [ ] **31.3.7** Empty/garbage resilience — a file that parses to zero channels contributes nothing and is counted in the derivation stats; it must not wipe previously derived entries for the country.
- [ ] **31.3.8** Derivation stats — return `{ files, entries, deduped, skipped }` for the Settings diagnostics readout and tests.
- [ ] **31.3.9** Unit tests — `catalog.spec.ts` on a committed micro-fixture (a dozen `<channel>` elements incl. `1-2-3.tv.de`-style ids, a duplicate across files, a suffix-less id): shapes, dedup, stats.
- [ ] **31.3.10** Line budget — keep `catalog.ts` pure and under 200 lines; anything stateful belongs in 31.2 or 31.4.

## Feature 31.4 — Catalog storage

The derived catalog becomes a first bulk table — the first inhabitant of the
"local knowledge store" (stone 2) that is not a parsed playlist row.

- [ ] **31.4.1** Record + schema — add `EpgCatalogRecord` to `src/core/storage/records.ts` and an `epgCatalog` store keyed `[country, id]` to `idb-schema.ts` (`BULK_STORE_NAMES` included), mirroring the `epgPrograms` composite-key pattern.
- [ ] **31.4.2** Version bump — raise `DB_VERSION` 1 → 2 with an upgrade path that creates the store without touching existing data; follow `src/core/storage/versioning.ts`'s conventions.
- [ ] **31.4.3** Tier parity — the store must work on all three tiers via the existing `StorageAdapter` surface; extend `src/core/storage/fixtures.ts` and the storage-contract matrix (`storage-contract.spec.ts`) so all tiers run the same new cases.
- [ ] **31.4.4** Replace-per-country writes — writing a country's catalog deletes that country's key range (`IDBKeyRange.bound([country, ''], [country, '￿'])`-style) then `bulkPut`s the new entries — stale entries from a shrunken feed must not linger.
- [ ] **31.4.5** Read path — `getCatalog(country): Promise<EpgCatalogRecord[]>` range query on the composite key; no `getAll`-then-filter over other countries' rows.
- [ ] **31.4.6** Bookkeeping keys — register the per-feed `{etag, lastFetchedAt}` kv keys (31.2.5) and a `epg.catalog.<country>.derivedAt` stamp in the storage keys module (`src/core/storage/keys.ts`) per its conventions.
- [ ] **31.4.7** localStorage discipline — on the partial tier, the catalog counts as re-derivable bulk data (not "small valuable"): it may be dropped under quota pressure via the existing guarded-write path, and the app re-derives on the next allowed fetch.
- [ ] **31.4.8** Memory-tier behavior — on the none tier everything still works within the session (fetch → derive → match) with zero persistence; assert in the matrix.
- [ ] **31.4.9** Size sanity — NL ≈ 370 entries ≈ tens of kB; assert a stored-size ceiling in a test with the US-scale fixture (~thousands of entries) to keep the table from ballooning silently.
- [ ] **31.4.10** Storage README — document the new store, key shape, and replace semantics in `src/core/storage/README.md`.

## Feature 31.5 — The matcher (Resolver v0)

Bind imported playlist channels to catalog entries. This is deliberately the
*resolver's* seam: exact today, semantic later (stone 5) — consumers only
see the mapping, never the strategy.

- [ ] **31.5.1** Module — `src/epg/match.ts`: `matchChannels(grouped: GroupedChannel[], catalog: EpgCatalogRecord[]): EpgMatchResult` — pure, synchronous, one pass; inputs come from `src/state/live-rows.ts`'s grouped cache and 31.4.5.
- [ ] **31.5.2** Strategy ladder — per grouped channel, in order: (a) any variant `tvgId` equals a catalog `id` (the feed convention playlists sometimes follow); (b) the grouped `key` (already `normalizeKey`-normalized) equals a catalog `normKey`; (c) curated-alias assist — `DUTCH_CATALOG` aliases resolve provider spellings to a canonical whose normKey then matches (`NED 1` → `NPO 1` → `NPO 1.nl`).
- [ ] **31.5.3** Mapping shape — `EpgChannelMatch { channelKey, catalogId, method: 'tvg-id' | 'name' | 'alias' }`; the result also carries `unmatchedChannels` and `unmatchedCatalog` lists for diagnostics.
- [ ] **31.5.4** Determinism — same inputs, same output, stable ordering; when 31.3.5's collision groups offer multiple catalog ids, prefer the one whose un-normalized id is closest to the channel's parsed base name (simple deterministic tiebreak, documented).
- [ ] **31.5.5** Mapping persistence — persist the mapping as a small kv snapshot (`epg.mapping.<country>`) so boot restores matches without recomputing before the playlist loads; recompute (and overwrite) whenever playlist rows or the catalog change.
- [ ] **31.5.6** Stone-1 framing — the mapping record is evidence *about* an entity, not UI state: keep it storage-owned (no Spektrum key holds the full map; views get derived counts only), and note in code that this record is the Codex v0 export candidate (stone 4).
- [ ] **31.5.7** Perf budget — 90 k input rows (grouped to a few thousand) + a 6-file US catalog must match in < 50 ms; add a perf assertion with a synthetic fixture, Set/Map lookups only, no nested scans.
- [ ] **31.5.8** Guide reuse — expose the mapping in the shape `epg-load.ts` needs (feed-id set) so 31.8 consumes *this* matcher and `matchXmltvChannels`'s independent logic is deleted, not duplicated.
- [ ] **31.5.9** Unit tests — `match.spec.ts`: each ladder rung, ladder precedence, collision tiebreak, unmatched lists, determinism (shuffled input, same output).
- [ ] **31.5.10** Match-quality fixture — commit a realistic NL fixture (provider spellings from `dutch-catalog.ts`'s aliases vs. real feed ids) and assert a ≥ 90 % match rate on it, so matcher regressions are visible as a number.

## Feature 31.6 — Live view integration

The catalog becomes a filter and a naming assist in the Live pipeline —
additive to the existing country/junk/curated filters, never a replacement
for the "never an empty screen" rule.

- [ ] **31.6.1** Grouping option — extend `GroupingOptions` (`src/channels/grouping.ts`) with `epgKnownKeys?: ReadonlySet<string>` (normKeys + alias-resolved keys precomputed by the caller); when present, channels not in the set are droppable under the new toggle.
- [ ] **31.6.2** Setting — `settings.live.epgVerifiedOnly` (default **off**), registered in `registry-keys.ts` + state README ownership table; read in `src/state/live-rows.ts`'s `ensureLiveRows()` options key so toggling rebuilds the cache.
- [ ] **31.6.3** Empty-screen rule — reuse the strict-mode fallback in `live-rows.ts`: if the EPG filter matches nothing (wrong country selected, catalog not yet fetched), show the unfiltered list plus the readout line saying the EPG filter matched nothing — never a blank view.
- [ ] **31.6.4** Stats — extend `GroupingResult.stats` and the `LIVE_STATS` readout with `droppedByEpg` and `epgMatched` counts; dropped-name samples must include EPG-dropped rows so "why is my channel missing?" stays answerable.
- [ ] **31.6.5** Row enrichment — `GroupedChannel` gains `epgId: string | null` from the mapping (carried through `toDisplayRows` onto the row), so Phase 17's now/next span and stone 7's timeline can key straight off the row without re-matching.
- [ ] **31.6.6** Naming assist — when a channel is catalog-matched but curated-unknown, display the catalog's suffix-stripped `displayName` instead of the raw provider spelling (curated canonical names still win when both know the channel — ranking stays curated-only).
- [ ] **31.6.7** Ordering unchanged — catalog membership must not affect sort order in this phase (curated rank, then name — `dutch-catalog.ts` remains the ordering authority); assert with a regression test.
- [ ] **31.6.8** Radio exemption — the EPG filter never applies to the Radio view (`radio: 'only'` builds bypass it; feeds carry no radio).
- [ ] **31.6.9** Rebuild triggers — catalog fetch completion and mapping recompute invalidate the live-rows cache (a new input to `optionsKey`), so Live reflects a finished background fetch without a reload.
- [ ] **31.6.10** Grouping tests — extend `grouping.spec.ts`: toggle on/off, fallback path, stats counts, `epgId` carry-through, radio bypass.

## Feature 31.7 — Settings & UI surface

The user-facing controls: pick a country from the registry, opt into the
verified-only filter, refresh on demand, and see what the catalog knows.

- [ ] **31.7.1** Country picker — replace the free-text country token input with a `<select>` sourced from the lazy-loaded registry (countries only, alphabetical by display name, plus "No filter"); writes the same `settings.live.country` token via the 31.1.5 bridge so existing behavior is preserved.
- [ ] **31.7.2** Wizard alignment — the first-run wizard's country step (step 1) uses the same registry-sourced options and bridge; one country choice, two consumers, zero drift.
- [ ] **31.7.3** Verified toggle — a Settings switch for `settings.live.epgVerifiedOnly` with help text stating what it does and that it needs a fetched catalog; `data-fn` wired and reachability-gate green.
- [ ] **31.7.4** Manual refresh — a "Refresh guide data" button calling the (already existing, currently unwired) `loadDefaultEpg(force = true)` path via a `defineFn` action; disabled while a fetch is in flight (single-flight state from 31.2.7).
- [ ] **31.7.5** Catalog readout — a diagnostics line in Settings: selected country, entries stored, matched channels, last fetch time (relative), last outcome (fresh / 304 / failed) — from the 31.3.8 stats and 31.2.5 bookkeeping.
- [ ] **31.7.6** Strings — every new label/help/notice in `strings.en.ts`, `strings.nl.ts`, `strings.de.ts` in the same commit; no literals in markup or TS.
- [ ] **31.7.7** State keys — all new UI-facing keys (fetch-in-flight flag, readout values) registered with owners; Spektrum writes stay inside `src/state/**`.
- [ ] **31.7.8** Failure notice — the 31.2.9 classified-failure notice renders as the established one-line, non-blocking pattern (mirror the storage-demotion notice), with a distinct message for offline vs. HTTP failure.
- [ ] **31.7.9** No-playlist state — with no playlist imported, the EPG section explains that a playlist is needed first (precondition 31.2.8) instead of showing a dead refresh button.
- [ ] **31.7.10** Built-dist smoke — manual check on `dist/`: pick NL, import the demo config's playlist, watch one polite fetch cycle in devtools' network tab, toggle verified-only, reload offline — document the run in the phase notes.

## Feature 31.8 — One pipeline: rewire Guide ingestion

The existing Guide (Phase "16/17-lite" code in `src/state/epg-load.ts`)
must ride the new pipeline instead of its private hardcoded one — one
download and one parse serving catalog, matcher, and program storage.

- [ ] **31.8.1** Registry-driven URLs — `loadDefaultEpg()` derives feed URLs from the selected country via the registry; delete the hardcoded `XMLTV_SOURCE_URLS` (and its NL-only assumption) from `src/epg/xmltv.ts`.
- [ ] **31.8.2** Shared fetch — `epg-load.ts` calls `fetchCountryFeeds()` (31.2) — TTL, ETag, sequencing, and single-flight all come from the one module; its private TTL bookkeeping is removed.
- [ ] **31.8.3** Shared match — program filtering uses the 31.5 mapping (matched feed-id set) instead of `matchXmltvChannels`; delete the superseded function and its spec, port any still-relevant cases onto `match.spec.ts`.
- [ ] **31.8.4** Catalog write-through — the same parsed documents produce the catalog write (31.4.4) before program filtering, so the catalog exists even for channels the current playlist doesn't carry (it describes the country, not the subscription).
- [ ] **31.8.5** Program pruning — on each ingest and once per boot, delete `epgPrograms` rows with `stop < now − 24 h` via a key-range sweep; report pruned counts in the derivation stats. (Closes the "never pruned, `getAll` into memory forever" gap.)
- [ ] **31.8.6** Guide unchanged — `guide-load.ts` and the timetable render exactly as before (same stores, same shapes); stone 7's timeline work starts from this preserved behavior. Assert with the existing guide specs untouched and green.
- [ ] **31.8.7** Match-before-programs ordering — programs are stored only for matched channels (as today), now including alias-matched ones — the concrete user win: channels the old exact-name match missed gain guide data.
- [ ] **31.8.8** Boot sequence — `bootstrap.ts` order preserved: paint stored guide first, then background `loadDefaultEpg()`; the catalog/mapping restore (31.5.5) slots in before `ensureLiveRows` consumers need it, without delaying first paint (measure: cold start budget unchanged).
- [ ] **31.8.9** Migration cleanliness — previously stored NL data (old bookkeeping key `epg.xmltv.lastFetchedAt`, unpruned programs) is migrated or swept exactly once; no orphaned kv keys remain (extend the versioning sweep).
- [ ] **31.8.10** Integration spec — an end-to-end test with mocked http: boot with country NL + fixture playlist → fetch trace polite → catalog stored → mapping built → programs stored for matched channels → Live stats show the counts → second boot inside TTL performs zero fetches.

## Feature 31.9 — Performance & budgets

The 60 kB app-payload, < 1 s cold-start, and 40-DOM-row invariants do not
move because EPG got smarter (Vision invariants table).

- [ ] **31.9.1** Lazy chunks — `countries.ts` (data), `catalog.ts`, `feed-fetch.ts`, and `match.ts` load via dynamic import from the background EPG path; none may appear in the entry chunk (assert via the existing budget/CI gate from UPGRADES U4).
- [ ] **31.9.2** Parse cost — measure channels+programme `DOMParser` cost for the largest single feed (usa*.xml, multi-MB decompressed); if a main-thread parse exceeds ~200 ms, split the parse across idle callbacks per file *(and note the Phase 16 worker as the real fix — do not build it here)*.
- [ ] **31.9.3** Memory bounds — decompressed XML strings and parsed documents are released between files (sequential processing, no accumulation of all N documents); verify with a heap snapshot note in the phase file.
- [ ] **31.9.4** Match perf — the 31.5.7 < 50 ms assertion runs in CI with the synthetic 90 k fixture.
- [ ] **31.9.5** Cold start — catalog restore is a kv read + range query off the boot critical path; measure cold start with a stored NL catalog and record the number (budget: unchanged vs. main).
- [ ] **31.9.6** Storage growth — with pruning (31.8.5) and replace-per-country (31.4.4) in place, assert steady-state storage for NL stays bounded across three simulated ingest cycles (no monotonic growth).
- [ ] **31.9.7** Fetch ceiling — politeness invariant as a test: a full TTL window with 10 reloads and 3 view switches produces ≤ (fileCount) upstream requests (0 after the first success), counted via the mocked http layer.
- [ ] **31.9.8** DOM budget — the Settings additions render as plain form rows; the country `<select>`'s 130+ options are static DOM, not `data-each` state (options never change reactively).
- [ ] **31.9.9** No-regression gates — `npm run verify` including the reachability and budget gates green on the phase branch before merge; record entry-chunk size before/after in the notes.
- [ ] **31.9.10** Numbers in the notes — record: gz vs. plain bytes fetched for NL, parse ms per file, match ms, entry-chunk delta, cold-start delta. Real numbers, not adjectives (UPGRADES.md's rule).

## Feature 31.10 — Verification, docs & stone bookkeeping

- [ ] **31.10.1** Spec inventory — new/updated: `countries.spec.ts`, `feed-fetch.spec.ts`, `catalog.spec.ts`, `match.spec.ts`, storage matrix additions, `grouping.spec.ts` extensions, the 31.8.10 integration spec; all green in `npm test`.
- [ ] **31.10.2** `src/epg/README.md` rewrite — module map (countries / feed-fetch / catalog / match / xmltv), the one-pipeline diagram, politeness rules, and regeneration instructions; keep it the "start here" doc per CLAUDE.md's table.
- [ ] **31.10.3** CLAUDE.md row — update the EPG row's description ("EPG (XMLTV ingest, country catalog, matching, now/next, guide)") so the agent map stays truthful.
- [ ] **31.10.4** State README — ownership table rows for every new key (31.6.2, 31.7.7) and a note that the EPG mapping is storage-owned, deliberately not a Spektrum key.
- [ ] **31.10.5** Channels README — document the new `epgKnownKeys` option, the naming-assist precedence (curated > catalog > raw), and that ordering stays curated.
- [ ] **31.10.6** Storage README — 31.4.10, plus the DB v2 migration note.
- [ ] **31.10.7** Stones cross-ref — a short "Vision 3.0 progress" note in this file's tail: what this phase actually delivered against stones 1 (entity seam), 2 (knowledge store inhabitant), 5 (resolver v0) — and what it deliberately did not (3, 4, 7).
- [ ] **31.10.8** Decision notes — every deviation from this plan recorded inline next to the task (masterplan §3's autonomy rule), especially matcher-ladder changes and any suffix surprises the generator uncovers.
- [ ] **31.10.9** Demo-config sanity — run the `.claude/context/thundertv-config-demo.xml` playlist through the new pipeline (thundertv-xml skill assists); record match rate and the top unmatched names — those names seed the next matcher iteration.
- [ ] **31.10.10** Merge discipline — all boxes checked, `npm run verify` green, branch merged to `main`, deployed; MASTERPLAN's "Beyond 1.0" table row marked done.

---

## Build order for the implementing agent

31.1 → 31.2 → 31.3 → 31.4 (foundation, each independently testable) →
31.5 (matcher) → 31.8 (rewire ingestion — do this *before* the UI so one
pipeline exists) → 31.6 (Live filter) → 31.7 (Settings) → 31.9 → 31.10.
Commit per feature; keep `npm run verify` green at every step; check boxes
in this file in the same commits.

## What comes next (explicitly not this phase)

1. **Stone 7 / timetable:** channel-row now/next (the reserved
   `channel-row__epg` span binds to the mapping this phase built), Guide
   time navigation, play-from-guide, and the catch-up scrubber.
2. **Stone 4 / Codex v0:** export the `epg.mapping.<country>` + user
   corrections as a signed file; the record shapes here were chosen to make
   that a serialization task, not a redesign.
3. **Stone 3 / health:** passive playback signals attached to the same
   channel identities.
