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
default. `WebHttpAdapter` takes a `getProxyTemplate` getter at construction;
`src/app/bootstrap.ts` supplies a real one reading `settings.proxyTemplate`,
which Settings → Streaming writes.

**Segments too, but not through this adapter.** hls.js/mpegts.js fetch video
segments themselves, so they never reach `classifiedFetch`. They are still
proxied, by two other means: `src/player/bindings.ts` runs the stream URL
through `applyProxy` before handing it to the engine, and the proxy rewrites
HLS manifests so every variant/segment/key URI points back at itself
(`scripts/cloudflare-cors-proxy.mjs`'s `rewriteManifest`). A configured proxy
therefore covers playback on the web — the older "segments remain CORS-bound
regardless" caveat predates both and is no longer true.

**What a proxy does not fix:** a provider that blocks the proxy's own egress
IP. Many panels serve their API to anything but reject stream endpoints from
datacenter ranges — often as a 404 rather than a 403 — which is why
`scripts/home-proxy.mjs` exists to run the same worker from a residential
connection. A CORS failure never carries a status code at all (it lands in
`cors-or-network` above), so a real 403/404 means the request arrived and was
refused.

## Testing

Test against `FakeHttpAdapter` (`src/core/platform/fake-platform.ts`), never
a real network call — see `src/core/platform/README.md`.
