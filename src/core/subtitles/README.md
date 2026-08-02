# src/core/subtitles/

Fetching subtitles for a film or an episode from a **free, keyless,
CORS-open** service, for the case a browser can never answer on its own: an
Xtream VOD file is a progressive download whose subtitle streams live inside
the container, and no browser exposes those to `video.textTracks`
(`src/player/README.md`'s "Subtitles the viewer brings"). Until now the only
route was a `.srt` the viewer already had on disk.

Pure by default — `identify.ts`, `providers.ts` and `languages.ts` do no I/O
at all, so every wire shape and every ranking decision is testable against a
captured payload. `client.ts` is the only file that touches the network, and
it does so through `getPlatform().http` like everything else
(`src/core/http/README.md`).

**Movies and TV episodes only, deliberately.** A live channel has no title to
look up, no fixed timeline for cues to sit on, and no end — there is nothing
here it could be given. The player renders the search row in the Movies/TV
Shows views only, and `state/subtitle-search.actions.ts`'s `identify()`
returns `null` for anything whose `player.active.kind` is not `vod`/`series`.

## Which service, and why this one

**The OpenSubtitles v3 Stremio addon** (`https://opensubtitles-v3.strem.io`)
for the subtitles, and **Cinemeta** (`https://v3-cinemeta.strem.io`) to turn a
title into an IMDb id. Both are Stremio addon-protocol services, which is the
whole reason they work from a browser: the protocol exists to be called by a
web client, so permissive CORS is a requirement of it rather than a courtesy.

The constraint that eliminated everything else is "no API key, not even a
baked-in one." A key in a static, no-backend app is a key in the bundle —
shared by every install, rate-limited as one user, and revocable by someone
who is not us.

- **Wyzie Subs (`sub.wyzie.ru`) was the leading candidate and is gone.** It
  now 301s to `sub.wyzie.io`, which answers
  `{"code":401,"message":"API key required", … "Claim a free key at
  store.wyzie.io/redeem"}`. Verified 2026-08-02. Disqualified.
- **OpenSubtitles' own REST API** (`api.opensubtitles.com`) requires an
  `Api-Key` header. Disqualified for the same reason.
- **SubDL, Subsource and friends** are all key-gated too.

### The CORS verification (2026-08-02, real requests)

Both halves matter — a search endpoint that answers a browser is useless if
the file it points at does not.

| Request | Result |
| --- | --- |
| `GET /subtitles/movie/tt0111161.json` (Origin: `https://example.com`) | `200`, `access-control-allow-origin: *`, `content-type: application/json` |
| `GET /subtitles/series/tt0944947:1:1.json` | `200`, `access-control-allow-origin: *` |
| `GET https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/36919` | `200`, `access-control-allow-origin: *`, `content-type: application/x-subrip; charset=utf-8`, 125 KB of real SubRip |
| `GET v3-cinemeta.strem.io/catalog/movie/top/search=the%20shawshank%20redemption.json` | `200`, `Access-Control-Allow-Origin: *`, `metas[]` with `id`/`imdb_id`/`name`/`releaseInfo` |

So the web build is fully covered — no proxy, no desktop-only path, nothing
degraded. Every request sets `noProxy: true` precisely because these already
answer a browser: routing them through the user's own proxy template would
only add a hop that can fail.

### Response shapes

`/subtitles/{movie|series}/{contentId}.json`:

```json
{ "subtitles": [
  { "id": "30949",
    "url": "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/36919",
    "SubEncoding": "CP1252", "lang": "eng", "m": "i", "g": "11" } ] }
```

Two things to know about it. There is **no release name** — a row carries a
language and an id and nothing else, which is why the menu numbers the rows
instead of naming them. And `lang` mixes both ISO 639-2 variants in a single
response (`cze` and `fre` are 639-2/B, `ron` and `ell` are 639-2/T), which is
what `languages.ts` exists for. The download URL's `subencoding-stremio-utf8`
segment means the service transcodes to UTF-8 for us, so nothing in this
feature guesses a charset.

`/catalog/{movie|series}/top/search=<query>.json` returns `metas[]` with
`id` (an IMDb id), `name` and `releaseInfo` (`"1994"`, or `"2008-2013"` for a
show — the leading year is taken). `year` is often `null`, so `releaseInfo` is
the field actually read.

## The identification ladder

A subtitle lookup is addressed by IMDb id. An Xtream panel gives us a display
name, sometimes a year, and — on TMDB-fed panels — a `tmdb_id`. So:

1. **A real `tt…` in the provider's own metadata.** `get_vod_info`'s
   `info.imdb_id`, now parsed and carried on `XtreamVodInfo`
   (`src/xtream/client.ts`) instead of being dropped. Exact and free.
2. **Title + year through Cinemeta**, ranked by `identify.ts`'s
   `rankTitleCandidates()`: exact normalized title beats prefix beats
   containment, a matching year adds more than any of those, a *mismatched*
   year subtracts, and the catalog's own popularity order breaks ties.
   Anything below the score floor is dropped rather than offered.
3. **Give up honestly** — `not-identified`, surfaced as "this title couldn't
   be identified", never a guess.

`tmdb_id` is threaded through and shown, **not resolved**: there is no keyless
TMDB → IMDb converter (TMDB's own `external_ids` endpoint needs a key), so
turning one into an id would reintroduce exactly the dependency this feature
exists to avoid. What it does instead is honesty: when rung 2 produced a match
that was not an exact title+year hit, the menu says *which* title it matched,
so a wrong film is visible before its cues are.

Series episodes reuse rung 2 (`get_series_info` returns only the episode map,
so there is no series-level `imdb_id` to read) and address the episode as
`tt…:season:episode` — `identify.ts`'s `contentIdFor()`.

## Caching

`cache.ts` keys on the **playback id** (`vod:123`, `series-ep:12:345`) plus
the language, never on the stream URL: an Xtream URL carries credentials and
changes when they rotate, while a row id names the same title forever. It
stores the *converted* WebVTT, since that conversion is deterministic.

Session memory always; `getPlatform().storage` on the `'full'` tier only —
the same gate `state/catalog-storage.ts` applies, because a 30–300 KB text
blob is not what `localStorage`'s ~5 MB budget is for and a failed write there
would trip a permanent tier demotion over a cache that is allowed to just not
persist. A bounded index evicts oldest-first at 40 entries.

One behaviour worth knowing: a cache hit is served **once** per session per
title. Pressing the search row again goes to the network, because the cache
exists so a replay is instant, not so the viewer is stuck forever with the
first file they ever picked.

## Failure, and the one thing this must never do

Every path ends in a terminal state. `SubtitleSearchOutcome` has no pending
member, `state/subtitle-search.ts`'s status is `'searching'` or something
final, and each of `unreachable`/`not-identified`/`none` has its own line of
copy. `core/http`'s taxonomy is collapsed to the two distinctions a viewer can
act on — "it took too long, try again" (`timeout`) versus "this device cannot
reach the service" (`cors-or-network`, `http`, `mixed-content`, `too-large`)
— because the rest is a difference they cannot do anything about.

A spinner that hangs is the specific failure this feature is not allowed to
have, so it is unrepresentable rather than merely avoided.
