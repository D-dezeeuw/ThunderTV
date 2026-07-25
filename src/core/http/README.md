# HTTP adapter

All network I/O goes through `getPlatform().http` (a `WebHttpAdapter` on the
web) so CORS/timeout classification is unavoidable — direct `fetch` is
ESLint-fenced everywhere outside `src/core/`.

## Failure kinds and their UX contract

`classifiedFetch` never rejects with an opaque `TypeError` for a failure a
user can act on — it resolves to one of these kinds instead:

| Kind               | Meaning                                            | Intended surface                                                               |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ok`                | 2xx response, body left unread                       | Caller reads/streams the body itself (e.g. the Phase 16 gzip XMLTV path)         |
| `http`              | Non-2xx status, including `304` (conditional refresh)| Import flow errors (Phase 07); `status === 304` means "skip the parse" (§6.6)    |
| `timeout`           | The default (or caller) timeout elapsed              | Import/connect-flow errors (Phase 07, Phase 14)                                  |
| `cors-or-network`   | Opaque `TypeError` — offline, DNS, or (most likely for IPTV providers) CORS | Connect-flow and stream errors (Phase 14, Phase 23); `crossOrigin`/`offlineHint` pick the specific explanation |
| `mixed-content`     | `https:` page, `http:` target — browsers fail this silently | Same surfaces as above; message points at the proxy setting and the desktop app |
| `too-large`         | Response exceeded a caller-supplied `maxBytes`       | Defensive only — protects memory from a misconfigured URL                       |

A rejected promise (not a classified result) means the *caller* aborted the
request via its own `AbortSignal` — that is not a failure to classify, it's
the caller already knowing what happened.

Message copy for each kind lives in `strings.http.failure.*`
(`src/app/strings.ts`), consumed by the Phase 02 error empty-state once a
real caller wires it up.

## Proxy

`applyProxy`/`isValidProxyTemplate` (`proxy.ts`) implement the optional
user-configured proxy from the architecture plan (masterplan §8, item 3): a
`{url}`-substitution template applied to playlist/EPG/Xtream calls, empty by
default. `WebHttpAdapter` takes a `getProxyTemplate` getter at construction —
today nothing supplies one (no proxy configured yet); Phase 22's Settings →
Streaming section will back it with real Spektrum state.

**Caveat:** hls.js/mpegts.js fetch video *segments* directly — those bypass
this adapter and remain CORS-bound on the web regardless of a configured
proxy. That expectation belongs to the player phases (masterplan §8.3), not
here.

## Testing

Test against `FakeHttpAdapter` (`src/core/platform/fake-platform.ts`), never
a real network call — see `src/core/platform/README.md`.
