# Channel filtering (`src/channels/`)

Turns a provider's flat channel dump into the **Live** view: one row per real
channel, its alternate feeds attached as variants.

A Dutch Xtream list ships the same channel several times over:

```
| NL | NPO 1 HD          ← live, 720p
| NL | NPO 1 FHD         ← live, 1080p
| NL | NPO 1 HD rec      ← catch-up feed
| NL | NPO 1             ← inside the "| NL | ODIDO HD" bundle category
```

Four rows, one channel. Live shows **NPO 1** once and offers the rest through
the variant strip in the player dock.

## Modules

| File                | Responsibility                                                                   |
| ------------------- | -------------------------------------------------------------------------------- |
| `name-parse.ts`     | Splits `\| NL \| NPO 1 HD rec` into country / base / quality / recording flag. Live/Radio/Categories only — the Movies/Series catalog's own, simpler decoration-stripping lives in `src/state/catalog-clean-name.ts` instead (see `src/state/README.md`'s "Movies/Series/Search catalogs" section for why they're separate). The one exception is its `parseCategoryName()`, which the catalog's service accordion (`src/state/catalog-category-tree.ts`) reuses to read a category's country tag — it knows every bracket convention in the wild, and duplicating that regex would be worse than sharing it. |
| `dutch-catalog.ts`  | ~70 curated Dutch + Flemish channels: canonical name, broadcast-order rank, aliases. |
| `junk-filter.ts`    | Name-shape junk detection (event slots, separators, dummies, adult).              |
| `grouping.ts`       | The collapse engine: country filter → junk filter → bucket by identity → sort.    |

`src/state/live-rows.ts` caches the result; `src/state/live.actions.ts`
publishes it into the shared virtual list.

## Radio

Radio stations (`radio="true"` in the M3U) are a separate medium, not a TV
channel that happens to be audio: no EPG, their own player layout, and the TV
catalog says nothing about them. `groupChannels()` partitions on the flag —
`radio: 'exclude'` (the default) builds the TV list, `radio: 'only'` builds the
Radio view. Country and filler filtering still apply there; the curated catalog
deliberately does **not**, since applying a TV whitelist to radio would empty
the list rather than narrow it.

## Two deliberate limits

**The catalog is an explicit shortlist, and strict mode is on by default.** It
holds exactly the Dutch channels the user asked for, and drives ordering,
canonical naming, and the strict filter. Turning "Curated channel list only"
off widens Live to everything the other filters allow, with the curated
channels still first — the escape hatch for a channel that should be there and
isn't. That switch matters because a repo-maintained list cannot keep up with
regional broadcasters, new launches, or a provider's own spelling quirks, and a
channel that vanishes with no explanation is worse than one extra row.

**Junk detection reads names, not streams.** Whether a stream is genuinely dead
can only be known by fetching it, and probing hundreds of URLs on every list
load would be slow and rude to the provider. Everything in `junk-filter.ts` is
therefore a cheap, deterministic, testable judgement about the *name*, and it
errs toward keeping things.

Because both filters can only remove rows, two things must stay true:

- **Categories** always shows the provider catalog untouched, so nothing is ever
  hidden beyond recovery.
- The Live header always reports how many rows were hidden and how many were
  merged. A channel the user cannot find must never look like the provider's
  fault when it was ours.

## Identity resolution

Bucketing happens on the **catalog-resolved** key, not the parsed one —
`NPO1 HD` and `Nederland 1 SD` normalize to different keys and only the alias
table knows they are the same channel. Resolving after bucketing produces two
rows with the same canonical name, which reads as a bug. (Caught by
`grouping.spec.ts`'s alias test.)

## Country resolution

A row's own `| NL |` prefix wins. When it has none, the row inherits its
category's prefix — provider bundles label the category, not every channel
inside it, so `Discovery Channel` under `| NL | DOCU` is correctly Dutch.

## EPG-verified filtering (Phase 31)

`groupChannels()` takes two more options: `epgMatches` (a `Map<channelKey,
catalogId>` from `src/epg/match.ts`'s `getMappingSync()`, built by
`src/state/live-rows.ts`) and `epgVerifiedOnly`. Presence in the map alone
never drops a row — it only supplies `GroupedChannel.epgId` (carried through
`toDisplayRows()` onto the `ChannelRow`, for a future now/next span to key
off directly). `epgVerifiedOnly` is the actual filter, off by default, same
never-empty-screen contract as `knownOnly`, and — like `knownOnly` — never
applied to Radio (`src/epg/countries.ts`'s catalog is TV-only).

**Naming precedence stays curated-first.** A channel the curated catalog
already knows displays its curated canonical name regardless of what the EPG
catalog's `displayName` says; the EPG match only adds `epgId`, never
overrides `name`/`rank`. Catalog membership answers "does this channel have
guide data," not "is this a real channel" — that judgement is still
`dutch-catalog.ts` + `junk-filter.ts`'s job.
