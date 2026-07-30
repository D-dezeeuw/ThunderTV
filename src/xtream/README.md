# src/xtream/

Xtream Codes API client: the endpoint map, stream URL construction, and the
error taxonomy for auth/network/CORS failures.

Owners: Phase 19 — Xtream API Client; Phase 20 — Xtream Live; Phase 21 —
Xtream VOD & Series.

## EPG (`epg.ts`)

The panel's own guide, and the reason `src/epg/`'s country-catalog matcher
is now a fallback rather than the primary path.

| Endpoint | Shape | Used for |
| --- | --- | --- |
| `xmltv.php?username=&password=` | XMLTV text | The whole subscription's guide, in one request. Parsed by `src/epg/xmltv.ts`'s existing `parseXmltvDocument()`. Note this is **not** a `player_api.php` action, so it does not go through `client.ts`'s `callApi()`. |
| `player_api.php?action=get_short_epg&stream_id=&limit=` | JSON | A few upcoming programmes for one channel, fetched when a channel with no guide data starts playing. |

Everything is keyed by `epg_channel_id`, which `client.ts` already stores on
each row as `tvgId` — so there is no name matching on this path at all.

Two panel behaviours this module exists to absorb:

- **`title`/`description` are base64 — sometimes.** Undocumented and
  inconsistently applied. `atob` is not a usable test for it: it strips
  whitespace and tolerates a ragged final chunk, so a plain title like
  `"NOS Journaal"` decodes into mojibake rather than throwing.
  `decodeMaybeBase64()` gates on strict charset, exact length, *and* a
  decode that yields valid UTF-8 with no control bytes.
- **Timestamps come three ways** — `start_timestamp`/`stop_timestamp`,
  `start`/`end` as unix-second strings, or `"YYYY-MM-DD HH:mm:ss"`.
  `epochMsFrom()` tries them in that order so one panel's spelling cannot
  silently produce `NaN` bounds.

One trap worth naming: `errors.ts`'s `looksLikeHtmlLoginPage()` is "the body
starts with `<`". That is right for the JSON endpoints and wrong for
`xmltv.php`, whose valid response opens with `<?xml`. `getXmltvGuide()`
identifies the document positively instead, and detects HTML separately so a
real login page still reports `auth-failed`.
