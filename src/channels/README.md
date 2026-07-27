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
| `name-parse.ts`     | Splits `\| NL \| NPO 1 HD rec` into country / base / quality / recording flag.    |
| `dutch-catalog.ts`  | ~70 curated Dutch + Flemish channels: canonical name, broadcast-order rank, aliases. |
| `junk-filter.ts`    | Name-shape junk detection (event slots, separators, dummies, adult).              |
| `grouping.ts`       | The collapse engine: country filter → junk filter → bucket by identity → sort.    |

`src/state/live-rows.ts` caches the result; `src/state/live.actions.ts`
publishes it into the shared virtual list.

## Two deliberate limits

**The catalog is not a whitelist.** It drives ordering, canonical naming and an
*optional* strict mode — it is not the filter. A hard whitelist silently hides
every channel it has never heard of: regional broadcasters, new launches, a
provider's own spelling quirk. A catalog maintained in this repo cannot keep up
with that, and a channel that vanishes with no explanation is worse than one
extra row. Strict mode exists for providers whose Dutch categories really are
mostly junk, and it is off by default.

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
