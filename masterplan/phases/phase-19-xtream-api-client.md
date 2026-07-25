# Phase 19 — Xtream API Client

> **Epic goal:** A small, defensive Xtream Codes client in `src/xtream/`: one module owns every provider URL shape, every failure is classified (auth vs network vs CORS vs empty), and dirty provider responses normalize into clean internal types — the foundation Phases 20–21 build live, VOD, and series on.
> **Verification:** The unit suite over `src/xtream/` (≥ 90 % statements) passes against both the clean and dirty fixture corpora; every provider URL is produced only by `src/xtream/urls.ts` (the lint fence and the grep test are green); each error-taxonomy kind is reproduced by a dedicated fixture and rendered with a redacted URL; no credential string appears in any log line, error message, or snapshot; `npm run build`, `npx tsc --noEmit`, and ESLint pass.

Before this phase, ThunderTV speaks only M3U and XMLTV; `src/xtream/` does not exist. After it, an `XtreamSource` (url/user/pass) can be saved in Settings → Streaming or arrive via a `#/connect?type=xtream` bookmark, authenticated against `player_api.php`, and queried through a typed action catalog ported from thunder-tv's `xtream-api.service.ts` — with a serialized request queue, per-kind caching, proxy support, and a tolerance layer that turns strings-for-numbers and arrays-as-objects into clean types. No browsing UI ships here; Phase 20 renders live TV on top of this client.

## Feature 19.1 — Credential model and storage

`XtreamSource` joins the playlists store as the plan's §5 table already reserves: a source definition small enough to persist even on the partial tier, keyed for bookmark upserts, and never allowed to leak through state history or exports by accident.

- [ ] **19.1.1** Source type — define `XtreamSource` in `src/xtream/types.ts` (`{id, name, url, user, pass, createdAt, lastRefresh, status?}`) stored on the playlists store as type `'xtream'`.
- [ ] **19.1.2** URL normalization — implement `normalizeXtreamUrl()` on save: strip trailing slashes and an accidentally pasted `/player_api.php` path, preserve explicit ports and scheme.
- [ ] **19.1.3** Tier persistence — persist Xtream source definitions on the full and partial tiers (small valuable data, plan §5); the memory tier keeps them for the session.
- [ ] **19.1.4** Bookmark upsert — wire `type=xtream` connect fragments (Phase 14) into upsert keyed on `type+url+user`, honoring `&save=0` session-only mode.
- [ ] **19.1.5** Settings form — add the Xtream form (url/user/pass/name) to Settings → Streaming with pre-save validation and a masked password input.
- [ ] **19.1.6** History hygiene — UI state references sources by id only; credential fields never enter recorded Spektrum history (§5.8).
- [ ] **19.1.7** Export opt-in — exclude `pass` from settings export by default, behind an explicit include-credentials checkbox with a plain-words warning mirroring the bookmark-generation warning.
- [ ] **19.1.8** Cascade delete — deleting an Xtream source purges its cached categories/streams and its `` `${playlistId}:` ``-prefixed EPG mappings.
- [ ] **19.1.9** Normalization tests — unit test `normalizeXtreamUrl` over trailing slashes, a pasted `/player_api.php`, preserved ports, and stray whitespace.
- [ ] **19.1.10** Upsert tests — unit test bookmark idempotency: same `type+url+user` updates in place, a different user creates a second source.

## Feature 19.2 — player_api endpoint map

One typed catalog of every `player_api.php` action, ported from thunder-tv's `xtream-api.service.ts` — the single place where the wire contract lives, so no free-form action string ever compiles elsewhere.

- [ ] **19.2.1** Action catalog — create `src/xtream/endpoints.ts` as a typed const map covering `get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_vod_info`, `get_series_categories`, `get_series`, `get_series_info`, `get_short_epg`, `get_simple_data_table`, plus the bare no-action auth call.
- [ ] **19.2.2** Typed params — type each entry's parameters (`{category_id?}`, `{stream_id, limit?}`, `{vod_id}`, `{series_id}`) and its raw response payload type in one place.
- [ ] **19.2.3** Forward reservations — keep not-yet-consumed actions (`get_simple_data_table`) in the map, marked as reserved, so Phases 20–21 never invent strings.
- [ ] **19.2.4** Closed action union — export `XtreamAction` derived from the map keys; no free-form action string compiles anywhere outside `src/xtream/`.
- [ ] **19.2.5** Deliberately loose wire types — define raw response types in `src/xtream/api-types.ts` with `string | number` unions reflecting dirty providers; only the 19.7 coercion layer tightens them.
- [ ] **19.2.6** Pure data module — keep `endpoints.ts` free of any fetch or URL imports — a catalog, not a client.
- [ ] **19.2.7** Quirk documentation — JSDoc each action with observed provider quirks ported from thunder-tv (e.g. `get_live_streams` without `category_id` returns the entire catalog).
- [ ] **19.2.8** xmltv constant — reserve `xmltv.php` as a distinct non-player_api endpoint constant, consumed by 19.9 and Phase 20.5.
- [ ] **19.2.9** Round-trip test — assert every map key travels through the request builder into the expected `action=…` query parameter.
- [ ] **19.2.10** Porting note — record a mapping table (thunder-tv service method → ThunderTV action) in this phase file's decision notes for future porters.

## Feature 19.3 — Authentication and account status

The bare `player_api.php` call is the Xtream handshake: `user_info` + `server_info`. Providers return it in a dozen dialects, expiry matters to users, and a banned account must classify as auth failure — never as a network hiccup.

- [ ] **19.3.1** Handshake call — implement `authenticate(source)` issuing the no-action `player_api.php` request and returning the parsed `{user_info, server_info}` envelope.
- [ ] **19.3.2** Tolerant user_info parse — accept `auth` as `1 | "1" | true`, `status` in `"Active" | "Banned" | "Disabled" | "Expired"` variants, and `exp_date` as an epoch-seconds string or `null` (never-expiring accounts).
- [ ] **19.3.3** Clean status type — derive `AccountStatus {authenticated, status, expiresAt?, maxConnections?, activeConnections?}` as the only shape the UI ever sees.
- [ ] **19.3.4** Expiry surfacing — show "expires in N days" on the source row once under 14 days and a distinct expired state, all through the strings module.
- [ ] **19.3.5** URL authority decision — parse `server_info`'s reported URL/port/https but keep the user-entered URL authoritative (providers misreport ports notoriously); note the decision in code.
- [ ] **19.3.6** Auth classification — `auth: 0` or a Banned/Disabled status classifies as `'auth-failed'` in the 19.5 taxonomy, never as a network error.
- [ ] **19.3.7** Cached status — run `authenticate` on source save and on a manual "Test connection" action, caching `AccountStatus` with a timestamp on the source record.
- [ ] **19.3.8** No raw echo — never log the raw `user_info` object (many providers echo the password inside it); log only the derived `AccountStatus` through the redacting logger.
- [ ] **19.3.9** Variant tests — unit test fixture `user_info` dialects: active with string numbers, expired, banned, `null` exp_date, and missing optional fields.
- [ ] **19.3.10** Expiry math tests — unit test the epoch-seconds → ms conversion and days-remaining derivation at day boundaries.

## Feature 19.4 — Stream URL construction

MASTERPLAN §6.8 verbatim: one module owns every URL shape, ported from thunder-tv's `xtream-url.service.ts`, with lint fences making it impossible for any other file to concatenate credentials into a string — that is how credential-leaking log lines are born.

- [ ] **19.4.1** URL module — create `src/xtream/urls.ts` exporting `apiUrl(source, action, params)`, `liveStreamUrl(source, streamId, ext = 'm3u8')`, `vodStreamUrl(source, streamId, containerExt)`, `seriesEpisodeUrl(source, episodeId, containerExt)`, and `xmltvUrl(source)` — the app's only provider-URL producer.
- [ ] **19.4.2** Ported shapes — implement the exact thunder-tv shapes: `/live/{user}/{pass}/{id}.{ext}`, `/movie/{user}/{pass}/{id}.{ext}`, `/series/{user}/{pass}/{episodeId}.{ext}`, and `player_api.php?username=…&password=…&action=…`.
- [ ] **19.4.3** Encoding discipline — `encodeURIComponent` every credential path segment and query value so passwords containing `@ & / %` survive intact.
- [ ] **19.4.4** Lint fence — add an ESLint `no-restricted-syntax` rule forbidding the literals `player_api.php` and `/live/` template concatenation outside `src/xtream/urls.ts`.
- [ ] **19.4.5** Container preference — thread a per-source live container extension option (`m3u8` default, `ts` for providers without HLS output) into `liveStreamUrl`, consumed by Phase 20's handoff.
- [ ] **19.4.6** redactUrl — implement `redactUrl(url)` beside the builders, masking user/pass path segments and `username`/`password` query values with `***` — the only URL form permitted into logs or error messages.
- [ ] **19.4.7** Pure builders — keep every builder a pure string function with zero fetch knowledge, trivially unit-testable.
- [ ] **19.4.8** Shape tests — assert each builder against known-good expected strings, including a password containing `@ &/%` characters.
- [ ] **19.4.9** Redaction tests — assert `redactUrl` masks both path-style and query-style credentials across every shape.
- [ ] **19.4.10** Fence-backing test — add a source-scanning test asserting no file outside `urls.ts` matches `/player_api\.php/`, cementing the lint fence in the test suite.

## Feature 19.5 — Error taxonomy

Built on §5.2's `classifiedFetch`: an Xtream failure is auth-failed, network/CORS-shaped, HTTP, timeout, provider-empty, or bad-payload — each with its own user-facing story, and none ever carrying a credential in its message.

- [ ] **19.5.1** Error union — define `XtreamError` in `src/xtream/errors.ts` with kind `'auth-failed' | 'cors-or-network' | 'http' | 'timeout' | 'provider-empty' | 'bad-payload'` plus status/detail fields.
- [ ] **19.5.2** Outcome mapping — map wire outcomes: opaque `TypeError` → `cors-or-network` (with the cross-origin flag), 401/403 or `auth: 0` → `auth-failed`, other non-2xx → `http`, `AbortSignal.timeout` → `timeout`, valid-but-empty where content is required → `provider-empty`, unparseable body → `bad-payload`.
- [ ] **19.5.3** HTML-login sniff — a 200 response whose body starts with `<` (an HTML login page) classifies as `auth-failed`, not `bad-payload` — a deliberate, documented rule.
- [ ] **19.5.4** Redacted by construction — every error carries only the `redactUrl` form; a dev-mode assert in the constructor rejects messages containing a credential substring.
- [ ] **19.5.5** Empty is contextual — expose an `isEmptyOk` flag per call site: an empty category is fine, but empty `get_live_categories` surfaces the classified state.
- [ ] **19.5.6** One error surface — render CORS-shaped failures with the plan-§8 explanation and alternatives (proxy, Electron) through the same component playlist and EPG imports use — three consumers, one surface.
- [ ] **19.5.7** Action context — attach the failing action name to every error so diagnostics read "get_live_streams failed: timeout".
- [ ] **19.5.8** Classifier tests — unit test classification over fixtures: HTML login page, JSON `auth: 0`, empty array, network `TypeError`, and a 512-byte HTML error page.
- [ ] **19.5.9** Hostile-body test — unit test the no-credentials assert against a fixture where the provider echoes the password inside its error body.
- [ ] **19.5.10** Taxonomy table — document kind → user-facing string key as a small table in this phase file.

## Feature 19.6 — Request etiquette

Providers ban clients that hammer. All `player_api` traffic flows through one serialized per-source queue with dedupe, small exponential backoff, an auth short-circuit, and clean aborts — etiquette enforced in one module, not sprinkled through call sites.

- [ ] **19.6.1** Serialized queue — implement `src/xtream/queue.ts`: one in-flight `player_api` request per source at a time.
- [ ] **19.6.2** In-flight dedupe — identical `(source, action, params)` requests already queued or in flight share one promise.
- [ ] **19.6.3** Backoff schedule — exponential per-source backoff on failure (1 s → 4 s → 15 s), reset on success; `auth-failed` short-circuits the queue until credentials change.
- [ ] **19.6.4** Retry cap — cap automatic retries at 2 per call; a user-initiated refresh always enqueues fresh.
- [ ] **19.6.5** Timeout and abort — give every request an `AbortController` with the 15 s `core/http` timeout; deleting a source aborts its entire queue.
- [ ] **19.6.6** Spacing constant — enforce a minimum inter-request spacing (~200 ms) as a documented queue constant — etiquette, not throttling theater.
- [ ] **19.6.7** Observable state — expose per-source queue state (`idle | busy | backoff-until`) as a Spektrum value for the sources view's status display.
- [ ] **19.6.8** No futile retries — never auto-retry a `cors-or-network` failure without user action; retrying a CORS block is pointless and looks like hammering.
- [ ] **19.6.9** Fake-timer tests — unit test serialization order, dedupe sharing, the backoff schedule with reset, and the auth short-circuit.
- [ ] **19.6.10** Abort-cleanliness test — assert abort-on-delete settles every consumer promise with no unhandled rejections.

## Feature 19.7 — Response schema tolerance

Real providers send `"42"` for 42, `{"0": {...}}` for arrays, and empty strings for absent fields. A thin coercion layer converts the wire chaos into clean internal types once, at the boundary — raw shapes never escape `src/xtream/`.

- [ ] **19.7.1** Coercer kit — build `src/xtream/coerce.ts` with `asNumber` (accepts `"42"`), `asString`, `asBool01` (`1 | "1" | true`), and `asArray`.
- [ ] **19.7.2** Object-as-array fix — detect the classic `{"0": {...}, "1": {...}}` payload (non-array object with numeric keys) and convert via `Object.values`.
- [ ] **19.7.3** Boundary normalizers — pass every list response through a normalizer yielding clean internal types (`XtreamCategory {id: number, name: string}`, `XtreamStream {…}`); raw wire shapes never leave `src/xtream/`.
- [ ] **19.7.4** Explicit absence — convert empty-string sentinels (`epg_channel_id: ''`, `stream_icon: ''`) to `undefined` so UI code never does falsy-string checks.
- [ ] **19.7.5** Drop unknowns — discard unrecognized extra fields at normalization, keeping per-row memory minimal for 10 k-stream categories.
- [ ] **19.7.6** Skip, never throw — a row failing coercion entirely (no usable id) is skipped and counted; one bad row must not kill a category.
- [ ] **19.7.7** Shared and small — keep normalizers pure and within the 300-line file rule; live (Phase 20) and VOD/series (Phase 21) share them.
- [ ] **19.7.8** Dirty corpus — commit small anonymized dirty samples under `src/xtream/__fixtures__/dirty/` (string ids, object-map lists, null category fields).
- [ ] **19.7.9** Coercer tests — unit test each coercer plus normalizer output shapes over the dirty corpus.
- [ ] **19.7.10** Skip-count test — unit test skip-and-count behavior on a corpus row missing `stream_id`.

## Feature 19.8 — Client-side caching policy

Parse once, read forever — applied to API data: a memory-first session cache with per-kind TTLs, tier-aware persistence (full tier reuses cold-start data; partial/none re-fetch), and stale-while-revalidate so lists are never blank on reopen.

- [ ] **19.8.1** Cache module — implement `src/xtream/cache.ts`: a memory-first session cache keyed `(sourceId, action, paramsKey)` holding normalized results.
- [ ] **19.8.2** TTL table — define per-kind TTLs as one reviewed constant: categories 6 h, stream lists 1 h, short EPG 5 min, auth status 15 min, VOD/series info 24 h.
- [ ] **19.8.3** Tier-aware persistence — persist categories and stream lists into an `xtreamCache` store on the full tier for cold-start reuse; on partial/none tiers the cache is memory-only and boot re-fetches (plan §5 degradation).
- [ ] **19.8.4** Stale-while-revalidate — publish expired-but-present list data immediately while a queued refresh replaces it; a reopened list is never blank.
- [ ] **19.8.5** Storage-path writes — write persisted cache entries through the storage adapter in chunks like every bulk write — never through recorded Spektrum state (§5.8).
- [ ] **19.8.6** Explicit invalidation — a credential change or manual source refresh clears that source's entire cache namespace.
- [ ] **19.8.7** Bounded footprint — cap the persisted cache per source with LRU-by-`storedAt` eviction so a 500-category provider cannot balloon IndexedDB.
- [ ] **19.8.8** Status API — expose `cacheStatus(sourceId, action, params) → 'fresh' | 'stale' | 'miss'` for Phase 20's conditional-fetch decisions.
- [ ] **19.8.9** TTL tests — with fake timers, unit test expiry, the stale-while-revalidate publish order, and invalidation on credential change.
- [ ] **19.8.10** Cache matrix — run the storage test matrix over the `xtreamCache` store (full tier persists across "reload"; memory tier matches within a session).

## Feature 19.9 — Proxy integration

The plan-§8 proxy template (`https://my-proxy/{url}`) applies inside `core/http`, so `player_api.php` and `xmltv.php` calls inherit it with zero Xtream-specific plumbing — while redaction still finds credentials buried inside the encoded inner URL.

- [ ] **19.9.1** Template in core — apply the user-configured proxy template inside `core/http` so all Xtream API and `xmltv.php` fetches inherit it automatically.
- [ ] **19.9.2** Inner-URL encoding — substitute `{url}` with the `encodeURIComponent`-ed full target; state plainly in settings that the proxy operator sees the proxied credentials (honest UX).
- [ ] **19.9.3** API-only scope — proxy API/EPG fetches only; stream media URLs handed to hls.js/mpegts.js stay unproxied by default, with a separate "proxy streams too" toggle carrying the plan-§8 segment caveat.
- [ ] **19.9.4** Proxy-down detection — distinguish an unreachable proxy origin from provider errors by comparing the failing origin, surfacing a `proxied` flag on the classified error.
- [ ] **19.9.5** Deep redaction — extend `redactUrl` to find and mask credentials inside the encoded inner URL of a proxied request.
- [ ] **19.9.6** Zero-cost default — an empty template (the default) is a true pass-through with no per-request overhead.
- [ ] **19.9.7** Capability awareness — when `capabilities.corsUnrestricted` is true (Electron later), ignore the template and say so on the settings row — no dead knobs.
- [ ] **19.9.8** Template tests — unit test template application (encoding, no double-proxying on re-entry) and the empty-template no-op path.
- [ ] **19.9.9** Proxied-redaction test — unit test redaction of a proxied `player_api` URL containing credentials in the inner URL.
- [ ] **19.9.10** Local-proxy smoke — run built `dist/` against a local CORS proxy: authenticate and `get_live_categories` succeed through the template; document the setup in this phase file.

## Feature 19.10 — Client unit tests with fixture responses

The client's contract is its test corpus: clean spec-shaped responses and dirty real-world ones must normalize identically, every taxonomy kind must be reproducible, and the whole layer must hold ≥ 90 % statement coverage before Phase 20 builds on it.

- [ ] **19.10.1** Twin corpora — assemble `__fixtures__/clean/` (spec-shaped responses per action) and `__fixtures__/dirty/` (string numbers, object-maps, HTML login page, empty categories, banned `user_info`).
- [ ] **19.10.2** Mock transport — inject a replay transport under the `core/http` seam (no real `fetch` in unit tests) serving fixtures per `(action, params)` with programmable failures.
- [ ] **19.10.3** Clean-flow test — run authenticate → `get_live_categories` → `get_live_streams` over the clean corpus and assert exact normalized output types.
- [ ] **19.10.4** Dirty-equivalence test — run the same flow over the dirty corpus and assert deep-equal normalized output wherever the corpora are semantically equal — the core tolerance guarantee.
- [ ] **19.10.5** Error-path coverage — reproduce every taxonomy kind from a dedicated fixture, asserting classification and redacted messages.
- [ ] **19.10.6** Queue+cache integration — assert two rapid identical calls hit the transport once, and a TTL expiry triggers exactly one revalidation hit.
- [ ] **19.10.7** Shape snapshots — snapshot the normalized outputs with Vitest to lock the internal shapes Phases 20–21 depend on.
- [ ] **19.10.8** Coverage gate — enforce ≥ 90 % statement coverage over `src/xtream/` in this phase's test run — it is the layer everything else trusts.
- [ ] **19.10.9** Anonymized fixtures — keep every fixture on `example.com` hosts with dummy credentials and under 50 rows — small and commit-friendly.
- [ ] **19.10.10** Checklist run — wire the suite into `npm test` and confirm the standing verification checklist, including the `urls.ts` lint fence, is fully green.
