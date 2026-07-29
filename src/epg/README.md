# EPG (`src/epg/`)

Where a channel's programme data comes from, and how a raw XMLTV feed
becomes both a **country catalog** (identity — is this a real, known
channel?) and the **Guide** timetable's stored data. Built across Phase 16
(ingestion, superseded) and Phase 31 (the country catalog and matcher).

## The pipeline, end to end

```
src/epg/countries.ts      the local mapping file: which countries exist in
(+ countries-data.ts)     globetvapp/epg, their feed files, their channel-id
                           suffix (verified live, never assumed from ISO code)
        │
        ▼
src/epg/feed-fetch.ts     polite fetch: gz-first, ETag-conditional, 12h TTL,
                           sequential+spaced, single-flight
        │
        ▼
src/epg/xmltv.ts          parseXmltvDocument() — one parse per fetched file
        │
        ├──────────────────────────────┐
        ▼                              ▼
src/epg/catalog.ts            toEpgRecords() (same file, xmltv.ts)
deriveCatalog() — pure,       — the matched subset, for the Guide's
suffix-stripped identities    epgChannels/epgPrograms tables
        │
        ▼
src/epg/catalog-storage.ts    replaceFileCatalog() — epgCatalog storage table
        │
        ▼
src/epg/match.ts              matchChannels() — the resolver: binds
                               GroupedChannel[] to catalog entries
        │
        ├── saveMapping() → storage + a sync cache (getMappingSync())
        │   src/state/live-rows.ts reads synchronously for the Live filter
        │
        └── matchedCatalogIds() → which programs toEpgRecords() keeps

src/state/epg-load.ts orchestrates all of the above (`loadDefaultEpg()`),
called from bootstrap.ts. src/epg/prune.ts sweeps stale epgPrograms rows.
```

One fetched file is parsed exactly **once** and feeds both the catalog and
the Guide's display tables — never two separate parses of the same text.

## Module map

| File                 | What it does | Pure? |
| --------------------- | ------------- | ----- |
| `countries.ts` / `countries-data.ts` | The registry: `EpgCountry { folder, filePrefix, fileCount, suffix, iso2, name, kind }`, plus lookup/bridge helpers (`findCountry`, `countryForLiveToken`, `feedUrls`, `stripCountrySuffix`). `countries-data.ts` is generated — see below. | Yes |
| `feed-fetch.ts`       | `fetchCountryFeeds()` — every HTTP byte this app fetches from `globetvapp/epg` goes through here. `clearFeedBookkeeping()` for Settings' cache clear. | No — `getPlatform().http`/`.storage` |
| `xmltv.ts`            | `parseXmltvDocument()` (shared by catalog derivation and Guide ingestion), `parseXmltvTimestamp()`, `toEpgRecords()`. | Yes (parsing is DOM-based but takes/returns plain data) |
| `catalog.ts`          | `deriveCatalog()` — one country's canonical channel identities from its parsed documents: suffix-stripped display names, `normalizeKey` reuse, cross-file dedup. | Yes |
| `catalog-storage.ts`  | The `epgCatalog` storage integration: `getCountryCatalog()`, `replaceCountryCatalog()`, `replaceFileCatalog()`. | No — storage |
| `match.ts`            | `matchChannels()` — the resolver (tvg-id → name → curated-alias ladder), plus the mapping's storage (`saveMapping`/`loadMapping`) and its synchronous sync cache (`getMappingSync`/`primeMappingCache`/`clearMapping`). | Matching itself yes; persistence no |
| `prune.ts`            | `pruneStalePrograms()` — deletes `epgPrograms` rows more than 24h past their `stop`. | No — storage |
| `now-next.ts`         | `nowNext()` — binary search for what is airing and what follows (masterplan §6.7), plus `progressPercent()`. Phase 32. | Yes |

`src/state/epg-load.ts`, `epg-settings.ts`, `epg-settings.actions.ts` are
the state-layer orchestration and Settings surface — see
`src/state/README.md`'s "EPG country catalog (Phase 31)" section for the
state-layer-specific decisions (the sync mapping cache, why matching
ignores the Live country prefix filter, etc.).

## The country registry — why a generator, why verified data matters

`globetvapp/epg` is 99 country/region folders (**not** the ~136 an earlier
informal count assumed — verified via a blobless `git clone
--filter=blob:none`, which sidesteps `api.github.com`'s 60/request-per-hour
anonymous rate limit entirely). Two facts the registry exists specifically
to avoid re-deriving or guessing at runtime:

- **A country's channel-id suffix is not reliably its ISO code lowercased.**
  `Unitedkingdom` is `iso2: 'GB'` but every channel id ends `.uk`
  (`suffix: 'uk'`) — the one folder in the dataset where the two disagree,
  found only by sampling a real feed file, not by assumption.
- **Channel ids can contain dots that aren't the country suffix**
  (`1-2-3.tv.de`) — `stripCountrySuffix()` only strips a trailing
  `.<suffix>`, never the first dot found.

`scripts/generate-epg-countries.mjs` regenerates `countries-data.ts` against
the live repo: HEAD-probes each folder's file count, range-fetches ~800
bytes of its first file to sample the suffix, writes the result between the
`GENERATED:START`/`GENERATED:END` markers. Politeness: sequential requests,
300ms spacing, aborts (touching nothing) rather than retrying into a
rate-limit response. Re-run it with `npm run gen:epg-countries` when the
upstream repo adds a country or a feed gains a file. `Sports`/`Caribbean`/
`Scotland` are `kind: 'region'` — each folder mixes several countries'
channels under one umbrella, so their single `suffix` field is only the
first sampled channel's, not a fact about the whole feed; `listCountries()`
excludes them and nothing in this phase selects a region as the active
country.

## Politeness (feed-fetch.ts)

- **gz-first**: `.xml.gz` is ~13× smaller than plain (measured on the
  Netherlands feed: 2.4 MB → 179 kB). Falls back to plain XML only when
  `DecompressionStream` is unavailable — no inflate library shipped for
  that case.
- **ETag-conditional**: every file's `{etag, lastFetchedAt}` is bookkept
  under `epg.feed.meta.<url>`; a 304 skips the parse entirely.
- **12h TTL**, matching the upstream feed's own daily 03:00 UTC refresh
  cadence — comfortably inside it without re-fetching on every reload.
- **Sequential, 300ms-spaced, single-flight**: never parallel, and a second
  concurrent call for the same country awaits the first's in-flight
  promise rather than racing a duplicate download.
- A file's failure is bookkept too (not just its success) — otherwise a
  blocked/dead file would retry on every reload inside the TTL window
  instead of backing off until the next one.

## The resolver (match.ts) — adapted from the phase plan

The phase plan's ladder was tvg-id → name → curated-alias, all three
applied to the **playlist** side. In this codebase `src/channels/
grouping.ts`'s `resolveIdentity()` already runs the curated-alias
resolution on every playlist row *before* the matcher ever sees it — so
literally re-running the same `DUTCH_CATALOG` lookup on the same
already-resolved key would be dead code. The alias table earns its keep on
the **catalog** side instead: a feed entry spelled `NED 1.nl` normalizes to
a key `DUTCH_CATALOG` recognizes as an alias for `NPO 1`, so
`buildNormKeyIndex()` also indexes that catalog entry under `NPO 1`'s
normalized key — exactly the key a playlist row already carries once
grouping.ts has resolved it. The plan's own example (`NED 1 → NPO 1 → NPO
1.nl`) still matches; so does the mirror case a literal reading would have
missed.

Determinism: a normKey collision (two catalog entries that happen to share
one) is broken by an exact `displayName` match to the channel's own
resolved name, then by the lexicographically first catalog id — never
input order, which a re-derive could shuffle.

## Storage

`epgCatalog` is a new bulk table, keyed `[country, id]` — see
`src/core/storage/README.md`'s own section for the shape and the DB v2
migration it required. `epgChannels`/`epgPrograms` (the Guide's own
display tables) are unchanged from Phase 16/17's original shapes; only
*how* they're populated changed (via the new pipeline's `toEpgRecords()`
call, matched against `match.ts`'s output instead of an exact-equality
check).

## Phase 32 — what's on now (stone 7)

Where Phase 31 ended at "which channels are real", Phase 32 answers "what
is on them":

- **Per-row now/next.** `src/state/epg-index.ts` holds every stored
  programme bucketed by channel and sorted by start — module memory, never
  Spektrum state (same bulk-data rule as `m3u/channel-memory.ts`), and
  populated by `guide-load.ts` from the `getAll('epgPrograms')` it already
  performs, so it costs no extra read. `state/list-publish.ts` enriches
  each *visible* row with now/next + progress on every windowed republish,
  and `src/ui/list-bindings.ts` re-triggers that republish on each
  `epg.tick` beat — masterplan §5.5's "one global tick re-enriches the
  visible slice", never a timer per row. The join is `ChannelRow.epgId`,
  Phase 31's matcher output, so an unmatched channel simply renders no EPG
  line rather than a wrong guess.
- **Guide time navigation.** `guide.offsetMs` shifts the timetable window
  in half-window steps (a half-window keeps the previous view's second
  half on screen as an anchor; a full-window jump leaves nothing shared).
  Travel is clamped to −24h (the programme retention horizon — further
  back is guaranteed-empty track) and +7 days. At offset 0 the window
  keeps tracking the clock with no extra bookkeeping, which is also why
  "back to now" is a single write of `0`.
- **Play from the guide.** A guide row's channel cell is a real button:
  `playChannelByEpgId()` resolves the EPG channel id back to a Live row via
  the same `epgId`. It returns `false` — a quiet no-op, not an error — when
  the current subscription doesn't carry that channel, because the Guide
  legitimately describes the whole country's catalog.

## What Phase 31/32 deliberately did not build

- **The catch-up scrubber** (the rest of stone 7's "time as an axis"):
  scrubbing back from live into catch-up needs per-provider URL-template
  handling (`src/m3u/catchup.utils.ts` has the parsing groundwork) and a
  transport UI that does not exist yet.
- **A registry-driven country `<select>`** replacing the existing 7-option
  curated shortlist in Settings/the first-run wizard — kept as-is
  deliberately (see `masterplan/phases/phase-31-epg-country-catalog.md`'s
  decision notes).
- **gzip inflate fallback** for engines without `DecompressionStream` — the
  plain-XML URL fallback covers it; no `fflate`-style library was added.
- **The XMLTV worker/streaming tokenizer** Phase 16 originally called for —
  the channels-only parse this phase needs is small enough for a
  main-thread `DOMParser`; revisit if full-programme ingestion for a
  large country (Usa's 6 files) turns out to block the main thread
  noticeably.
