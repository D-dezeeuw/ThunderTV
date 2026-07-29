# Fuzzy search core (`src/search/`)

Turns a typed query and a list of already-loaded rows into a ranked subset —
the engine behind search over Live channels, the movie catalog, the series
catalog, and an "everything" scope that spans all three.

It is pure logic: no Spektrum, no DOM, no imports from anywhere else in the
app, no user-visible strings (there are none to own — every string here is
either a normalized comparison key or an internal score). That isolation is
deliberate: a channel list can run to ~20k rows, and re-deriving anything
per keystroke over that many rows is the difference between a search box
that feels instant and one that visibly lags.

## The problem shape

Provider names are inconsistent in the same handful of ways every time:

```
┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ        →  a Dutch box-drawing prefix, a recording glyph
┃USA┃ 24/7 | MOVIES        →  pipes as both a bracket and a separator
Avengers: Endgame (2019) 4K →  punctuation and a quality suffix around the title
König der Löwen             →  diacritics
```

A user typing `konig` or `npo 1` expects all four kinds of noise to be
invisible to the match. Two modules split that problem in two:

| File           | Responsibility                                                            |
| -------------- | ------------------------------------------------------------------------- |
| `normalize.ts` | `normalizeForSearch()` — collapses one name to one comparison key.        |
| `fuzzy.ts`     | `fuzzyScore()` and `rankSearch()` — scores and ranks pre-normalized keys. |

## Public API

```ts
normalizeForSearch(input: string): string

fuzzyScore(query: string, target: string): number | null
rankSearch<T>(
    query: string,
    items: readonly T[],
    getKey: (item: T) => string,
    limit?: number, // default DEFAULT_SEARCH_LIMIT (500); pass Infinity for all matches
): T[]
```

`fuzzyScore` and `rankSearch` both assume their string inputs are already
normalized — see "Normalize once" below.

## Ranking tiers

Highest score wins; `null` means no match at all. In order:

1. **Exact** — the whole normalized query equals the whole normalized target.
2. **Substring** — the query occurs verbatim inside the target; an earlier
   occurrence scores higher.
3. **Word-prefix** — every word in the query prefixes some word in the
   target, matched left to right (`"npo 1"` matches `"npo 1 hd"`; `"1 npo"`
   does not — order is not negotiable).
4. **Subsequence** — the query's characters occur in the target in order,
   gaps allowed; a tighter span between the first and last matched
   character scores higher.

Within every tier a shorter target gets a mild boost — a tie-breaker,
never large enough to cross into the next tier up (the tiers are spaced far
enough apart in score space that no combination of in-tier bonuses can
bridge the gap; see `fuzzy.ts`'s constants if you need the exact margins).

## Normalize once, score many times

`normalizeForSearch()` does real work per call — Unicode NFD decomposition,
three regex passes — cheap for one string, not free 20,000 times over. The
contract that keeps a full-catalog search fast:

- **Normalize every row's search key once, when it enters the catalog**
  (parse/import time), and store the normalized key alongside the row —
  never the raw provider string.
- **Normalize the query once per search**, not once per candidate.
  `rankSearch()` already does this internally — pass it the raw, unnormalized
  query string.
- **Never re-normalize a stored key.** `fuzzyScore()` takes the key as-is; if
  you're calling `normalizeForSearch()` inside a loop over rows, something
  upstream is recomputing what load time should have cached.

`rankSearch()` returns matches sorted by score descending, and — deliberately,
tested — ties keep the original relative order of `items` rather than an
arbitrary one, so re-running a search on an unchanged list never visibly
reshuffles equal-scoring rows.

## Who consumes this

`src/state/`'s search actions (Live search, catalog search, the "everything"
scope) are the intended caller: they own the normalized-key cache per row
type and call `rankSearch()` per keystroke, never `normalizeForSearch()`
per keystroke. Nothing in `src/search/` reaches into `src/state/` or
`src/ui/` — this module only ever gets called, it never calls out.

## Deliberate non-goals

- **No typo tolerance beyond subsequence matching.** There is no edit-distance
  scoring here; a subsequence match already covers most fat-finger and
  partial-word cases cheaply, and true fuzzy edit-distance is a different
  (much more expensive) algorithm this module does not need at 20k-row scale.
- **No highlighting/match-span output.** Callers get a score and an order,
  not the character ranges to bold in the UI. Add that separately if a
  consumer needs it — don't compute it here for callers that don't.
