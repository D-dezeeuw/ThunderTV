# Phase 20 — Xtream Live

> **Epic goal:** Xtream live TV inside the exact same list UI as M3U — categories load lazily, streams cache per category, rows map into the shared channel shape, and `get_short_epg` fills now/next for visible rows when no XMLTV covers them.
> **Verification:** `npm run test:integration` is green against the fixture mock server in both clean and dirty modes, covering auth → categories → streams → short-EPG decode → playback-URL construction, the `xmltv.php` ingestion path, and every simulated failure's classification; manual smoke on built `dist/`: open the mock Xtream source, expand a category, watch now/next appear after scroll settle, play and zap between M3U and Xtream channels, reload and see the session restore — with the ≤ ~40 DOM-row and < 50 ms search budgets from §3 holding throughout.

Before this phase, the Xtream client (Phase 19) can authenticate and fetch but nothing renders. After it, opening an Xtream source lands in the familiar channel list: `get_live_categories` populates the groups view on first open, `get_live_streams` loads per category on expand, and mapped rows — stream URLs built solely by `src/xtream/urls.ts` — flow through the identical virtual list, search, favorites, EPG enrichment, and playback paths as M3U channels. Visible rows without XMLTV coverage get on-demand `get_short_epg` now/next; a per-source toggle feeds the provider's `xmltv.php` guide through the whole Phase 16 ingestion pipeline. A ported fixture mock server proves the flow end to end.

## Feature 20.1 — Live category loading

Categories are the portal's front door: fetched lazily on first open through the serialized queue, mapped into the same group model the M3U groups view renders, and served stale-while-revalidate so a reopened source paints instantly.

- [ ] **20.1.1** Lazy first fetch — opening an Xtream source triggers `get_live_categories` through the 19.6 queue on first view — never at app boot.
- [ ] **20.1.2** Cache-first serve — serve fresh cache directly; stale entries publish immediately while the queued revalidation replaces them (19.8.4).
- [ ] **20.1.3** Group-model mapping — map categories into the exact group model the M3U groups view consumes (`name`, `id`, count-when-known) so the groups UI renders them unchanged.
- [ ] **20.1.4** Ordering — keep provider category order as default with the same optional A–Z sort toggle M3U groups use.
- [ ] **20.1.5** Instant loading state — render a text loading state ("loading categories…") from Spektrum state immediately — no spinner animation, per the no-animation rule.
- [ ] **20.1.6** Empty classification — zero categories renders the classified `provider-empty` state with "Test connection" and proxy hints — never a blank screen.
- [ ] **20.1.7** Cold-start reuse — on the full tier, persisted categories render before any network per parse-once; the partial tier shows the loading state while re-fetching (plan §5).
- [ ] **20.1.8** Lazy counts — category payloads lack stream counts; fill counts in as stream lists load, without reflowing the list.
- [ ] **20.1.9** Mapping tests — unit test the category→group mapping plus the cache-fresh versus revalidate paths against the mock transport.
- [ ] **20.1.10** Warm-open smoke — against the 20.10 mock server, confirm categories are visible < 500 ms on a warm open and note the timing.

## Feature 20.2 — Live stream listing per category

Fetch-on-expand, exactly like the M3U chunked group pattern: a category's streams load once per TTL, append into the module-memory array behind the windowing controller, and render through the byte-for-byte identical virtual list path.

- [ ] **20.2.1** Fetch on expand — expanding a category issues `get_live_streams&category_id=…` on demand through the queue; nothing prefetches the whole catalog.
- [ ] **20.2.2** Shared list path — append normalized streams into the module-memory array backing the windowing controller so the virtual list code path is identical to M3U.
- [ ] **20.2.3** Multi-expand — multiple expanded categories coexist; re-expanding within TTL serves cache with zero requests.
- [ ] **20.2.4** Chunked persistence — write each category's streams to the full-tier `xtreamCache` in chunks so previously expanded categories render cold-start without network.
- [ ] **20.2.5** Inline states — show a per-category in-flow loading row while fetching; a failure renders its classified error inline with a retry action, leaving other categories intact.
- [ ] **20.2.6** Streaming append — for 10 k+-stream categories, append in normalizer chunks so the first rows paint before the payload finishes parsing.
- [ ] **20.2.7** Order and settings — keep provider stream order as default; the global sort and density settings apply unchanged.
- [ ] **20.2.8** Dedupe visibility — dev-assert that expanding a category enqueues at most one request, proving the 19.6.2 dedupe end to end.
- [ ] **20.2.9** Expand tests — unit test fetch-on-expand wiring, chunked append, and the inline error state with the mock transport.
- [ ] **20.2.10** Row-budget profile — scroll a 10 k-stream expanded category and confirm the ≤ ~40 DOM-row budget and frame rate hold; record the numbers.

## Feature 20.3 — Channel row mapping

One pure mapping turns an `XtreamStream` into the shared `Channel` row: a namespaced id, a stream URL built exclusively by `urls.ts`, and `epg_channel_id` carried as the tvg-id equivalent — which is what lets the entire EPG stack work on Xtream rows with zero new code.

- [ ] **20.3.1** Mapping module — implement `src/xtream/live-mapping.ts` mapping `XtreamStream → Channel`: id `` `xtream:${sourceId}:${stream_id}` ``, name, logo from `stream_icon`, group from the category name.
- [ ] **20.3.2** EPG id passthrough — carry `epg_channel_id` as the row's tvg-id equivalent so the 16.8 index, 17.7 availability, and 18.5 auto-matching apply unchanged.
- [ ] **20.3.3** URL delegation — construct the stream URL exactly once at mapping time via `liveStreamUrl()` from `urls.ts`; no component ever concatenates credentials.
- [ ] **20.3.4** Lazy logos — reuse the existing fixed-box `<img loading="lazy">` row template with the standard broken-icon placeholder fallback.
- [ ] **20.3.5** Channel number — carry `num` onto the row for display and provider-order sorting parity.
- [ ] **20.3.6** Pure and chunkable — keep the mapper a pure array-in/array-out function reused by search, favorites snapshotting, and the streaming append.
- [ ] **20.3.7** Denormalization boundary — everything favorites/recent will snapshot (20.6) already sits on the mapped row — name, URL, logo, group.
- [ ] **20.3.8** Contract tests — unit test the id scheme, the `urls.ts` delegation (spy-asserted), and the `epg_channel_id` passthrough.
- [ ] **20.3.9** Container tests — unit test that the per-source container preference (`m3u8` vs `ts`) is reflected in mapped URLs.
- [ ] **20.3.10** Dirty snapshot — snapshot one row mapped from the dirty corpus, proving coercion + mapping end to end.

## Feature 20.4 — get_short_epg integration

When XMLTV does not cover a channel, the provider's own short EPG fills the gap — requested only for settled visible rows, base64-decoded, normalized into the same `EpgProgram` shape, and fed into the Phase 17 enrichment cache so bars and lines just work.

- [ ] **20.4.1** Gap-only requests — request `get_short_epg&stream_id=…&limit=2` only for visible rows whose 17.7 availability flag is false — XMLTV-covered rows never trigger it.
- [ ] **20.4.2** Settle batching — batch requests on window settle (rAF-debounced ~300 ms after scrolling stops) for the settled visible rows only — never the whole catalog.
- [ ] **20.4.3** Base64 decode — decode the Xtream quirk of base64-encoded titles/descriptions with `atob` plus a UTF-8 `TextDecoder` pass for non-ASCII content.
- [ ] **20.4.4** Shared program shape — normalize entries into `EpgProgram` (`start_timestamp`/`stop_timestamp` epoch-seconds → ms) and feed the per-channel memory cache, so `enrichVisible()` and the progress bar consume them identically.
- [ ] **20.4.5** TTL reuse — cache short EPG per stream under the 5 min TTL from 19.8.2; the memoized `nowNext` handles ticks within a programme.
- [ ] **20.4.6** XMLTV precedence — XMLTV data always wins; short EPG only fills channels the ingestion pipeline left empty, with the resolution order documented in code.
- [ ] **20.4.7** Silent per-row failure — a failed short-EPG request shows no error UI (it is a nicety), but failures count into a diagnostics value on the sources view.
- [ ] **20.4.8** Stale-batch cancellation — cancel pending short-EPG batches when the window moves on, so fast scrolling across 90 k rows never floods the serialized queue.
- [ ] **20.4.9** Decode and precedence tests — unit test the base64+UTF-8 decode with a non-ASCII fixture, the epoch-seconds conversion, XMLTV-wins precedence, and batch cancellation.
- [ ] **20.4.10** Settle smoke — on the mock server, verify rows gain now/next within a second of scroll settle and their bars tick with the global 30 s tick.

## Feature 20.5 — xmltv.php full-EPG option

Providers ship a full XMLTV guide at `xmltv.php`. A per-source toggle registers that URL as a Phase 16 EPG source — the entire ingestion pipeline (worker, gzip, normalization, pruning, matching) applies with no special-case code, and short EPG automatically stands down for covered rows.

- [ ] **20.5.1** Source toggle — add "Use provider guide (XMLTV)" per Xtream source in Settings → Streaming, registering `xmltvUrl(source)` as a Phase 16 EPG source.
- [ ] **20.5.2** Pipeline reuse — the provider guide flows through the exact Phase 16 path: worker parse, gzip magic-byte detection (providers gzip `xmltv.php` routinely), normalization, storage, pruning — zero special cases.
- [ ] **20.5.3** Lifecycle binding — conditional-refresh headers and the 6 h staleness policy apply as with any EPG source, and the entry is created/deleted together with its Xtream source.
- [ ] **20.5.4** Automatic handover — after import, 18.5 auto-matching binds `epg_channel_id` values, 17.7 availability flips, and short EPG stops firing for covered rows with no coordination code.
- [ ] **20.5.5** Redacted identity — display the entry as "Guide — {source name}" and pass its credential-bearing URL through `redactUrl` in every display and log context.
- [ ] **20.5.6** Partial-tier warning — enabling the toggle on the partial tier warns that guide data will not persist (EPG bulk is full-tier only) and re-fetches per session.
- [ ] **20.5.7** Queue scoping — `xmltv.php` fetches use `classifiedFetch` with timeout but bypass the `player_api` serialized queue (a different endpoint class); document the decision.
- [ ] **20.5.8** Lifecycle tests — unit test registration/deregistration with the source lifecycle and the redacted display name.
- [ ] **20.5.9** Toggle tests — unit test that enabling triggers exactly one ingestion and disabling removes this source's guide association without touching other EPG sources' data.
- [ ] **20.5.10** Handover smoke — on the mock server (which serves a small `xmltv.php`), toggle on and verify rows gain XMLTV now/next while the short-EPG diagnostics counter stops increasing.

## Feature 20.6 — Favorites/recent interop

Xtream channels snapshot identically to M3U channels — same denormalized shape, same actions, same fast-boot path. The one Xtream-specific wrinkle is credential rotation, which must rewrite snapshot URLs so old favorites keep playing.

- [ ] **20.6.1** Shared snapshot action — favoriting an Xtream row uses the existing favorites action and produces the same denormalized shape (name, stream URL, logo, group, id) — no Xtream-specific favorites path.
- [ ] **20.6.2** Recent parity — playing an Xtream channel records the same capped (≤ 100) recent entry as M3U playback.
- [ ] **20.6.3** Fast-boot extension — snapshots embed the constructed stream URL, so Xtream favorites render and play at boot before any category fetch — the partial-tier fast path extends automatically.
- [ ] **20.6.4** Credential rotation — on credential change, rewrite stored favorite/recent URLs for that source's `` `xtream:` ``-prefixed ids from the new credentials in one migration pass over snapshots.
- [ ] **20.6.5** Orphan policy — favorites from a deleted source stay listed in a "source removed" state with a cleanup action (product decision noted in this phase file).
- [ ] **20.6.6** Guide inclusion — Xtream favorites appear in the Phase 18 favorites-only guide, resolving EPG through `epg_channel_id` and mappings like any row.
- [ ] **20.6.7** Uniform gestures — the context-menu toggle, `f` key, and long-press favorite behaviors work identically on Xtream rows via the shared row template — verified, not reimplemented.
- [ ] **20.6.8** Parity test — unit test that an M3U row and an Xtream row passed through the same action produce the identical snapshot schema.
- [ ] **20.6.9** Rotation test — unit test the credential-rotation URL rewrite over fixture snapshots, including untouched non-Xtream entries.
- [ ] **20.6.10** Partial-tier smoke — favorite an Xtream channel, reload on the partial tier, and confirm it renders and plays before any Xtream fetch completes.

## Feature 20.7 — Category caching and refresh

Refresh is scoped and conditional: per-category on demand, TTL-gated on expand, and diffed by `stream_id` so row identity — favorites references, the playing channel — survives. Stale data always beats a blank list.

- [ ] **20.7.1** Per-category refresh — a group-header context action re-fetches that category bypassing TTL and replaces its rows in place.
- [ ] **20.7.2** Bounded source refresh — a source-level refresh re-fetches categories, then only the currently expanded categories' streams — never a full-catalog crawl.
- [ ] **20.7.3** TTL gate — expanding within TTL performs zero requests (`cacheStatus` 'fresh'); stale triggers revalidate-behind while cached rows stay visible.
- [ ] **20.7.4** Identity-preserving diff — diff replacements by `stream_id` so favorites references and the actively playing channel survive a refresh.
- [ ] **20.7.5** Change accounting — drop upstream-removed streams and append new ones in provider order, reporting both counts in a refresh summary.
- [ ] **20.7.6** Subtle status — surface per-category refresh state as plain "updating…" text in the group header — no spinner animation.
- [ ] **20.7.7** Memory/storage lockstep — update the persisted cache rows in the same chunked write as the in-memory replacement so the two never diverge.
- [ ] **20.7.8** Stale beats blank — a category refresh error keeps existing rows visible and shows the classified error inline.
- [ ] **20.7.9** Refresh tests — unit test the TTL gate, the identity-preserving diff, and error-keeps-stale behavior.
- [ ] **20.7.10** Summary test — unit test refresh-summary counts against a fixture containing both added and removed streams.

## Feature 20.8 — Live playback handoff

A row click hands the engine host a URL — that is the whole integration. Engine selection stays URL-driven (§6.5), teardown discipline (§5.3) is untouched, and everything from zap history to session restore works across M3U and Xtream because nothing downstream knows the difference.

- [ ] **20.8.1** Unchanged handoff — an Xtream row click calls the same `setActiveChannel`/`playChannel` path from Phases 10–12; the engine host knows nothing about Xtream.
- [ ] **20.8.2** URL-driven selection — engine choice remains §6.5's URL sniff: `.m3u8` → hls.js/native, `.ts` → mpegts.js — so the per-source container preference implicitly selects the engine; document the pairing.
- [ ] **20.8.3** Teardown intact — destroy-before-create (§5.3) covers M3U↔Xtream zapping through the single engine host with no new lifecycle code.
- [ ] **20.8.4** Free-riding features — verify (not reimplement) that zap history, dock/theater mode, volume memory, and ←/→ keyboard zapping work on Xtream rows.
- [ ] **20.8.5** Mixed-content check — run the §5.9 detection on the constructed URL so an `http://` provider on the `https://` Pages origin explains itself before the player fails silently.
- [ ] **20.8.6** Failure hints — engine failures surface the standard retry/try-other-engine actions; a 401/403 on the media URL adds an expiry hint linking to "Test connection".
- [ ] **20.8.7** Recent on play — the playing row snapshots into recent through the shared action (locks 20.6.2 in the playback path).
- [ ] **20.8.8** Session restore — the §6.4 channel-state cache restores a last-watched Xtream channel on reboot, rendered and playable immediately from its snapshot URL.
- [ ] **20.8.9** Handoff test — integration-test that a click delivers the exact `urls.ts`-constructed URL to the engine host (spy) and teardown fires on zap.
- [ ] **20.8.10** Zap smoke — on built `dist/` with the mock server: play, zap ten channels across M3U and Xtream, reload, and confirm the session restores with the last Xtream channel playable.

## Feature 20.9 — Search across Xtream live

Loaded Xtream rows join the Phase 09 pipeline unchanged — one normalize function, one incremental filter, one budget. What cannot be searched (unexpanded categories) is stated honestly, with a bounded opt-in to load the rest.

- [ ] **20.9.1** Pipeline reuse — loaded (expanded or cached) Xtream rows live in the same module-memory array the Phase 09 incremental filter scans; no second search path.
- [ ] **20.9.2** One normalizer — the Phase 09 diacritics/case normalization applies to Xtream names via the same function — any fork is a review reject.
- [ ] **20.9.3** Honest caveat — with unexpanded categories present, the results footer states "searched N loaded of M categories — expand or refresh to search more" via the strings module.
- [ ] **20.9.4** Bounded load-all — offer "Load all categories for search": queue-fetch remaining categories with progress through the serialized queue, cancellable at any point.
- [ ] **20.9.5** Budget check — measure keystroke-to-filtered-list latency with a fully loaded 50 k-stream source and assert the < 50 ms §3 budget; record the number.
- [ ] **20.9.6** Group-filter interop — the group dropdown lists Xtream categories, and combined group + text filtering behaves exactly as with M3U groups.
- [ ] **20.9.7** Enriched results — result rows render through the standard row template, with EPG enrichment applying to the visible result slice (17.6) as on every other list.
- [ ] **20.9.8** Cancel semantics — cancelling load-all keeps already-fetched categories cached and updates the caveat count accordingly.
- [ ] **20.9.9** Search tests — unit test caveat counting (loaded versus total), incremental filtering over a mixed M3U+Xtream array, and load-all cancellation.
- [ ] **20.9.10** Latency smoke — manually verify search latency against mock data and that the caveat clears once every category is loaded.

## Feature 20.10 — Live-flow integration tests against a fixture mock server

The mock-server pattern ported from thunder-tv's `xtream-mock-server`: a tiny local Node server replaying the Phase 19 fixture corpora, simulating failures on demand, and anchoring an integration suite that proves the full live flow — without GitHub Actions, as part of the release checklist.

- [ ] **20.10.1** Mock server — build `tests/mock-xtream/`: a small Node HTTP server with routes for `player_api.php` (per-action fixture responses), `xmltv.php` (a small gzipped XMLTV), and `/live/…` media stubs.
- [ ] **20.10.2** Shared truth — serve the 19.10 clean and dirty corpora behind a mode switch so unit and integration layers test against one set of fixtures.
- [ ] **20.10.3** Failure simulation — simulate 401, an HTML login page, a delayed-response timeout, and empty categories per request via a control header the tests set.
- [ ] **20.10.4** Happy-path suite — a Vitest integration suite against `127.0.0.1` (no CORS locally) covering auth → categories → expand → mapped rows → short-EPG decode → playback URL construction.
- [ ] **20.10.5** Guide-path coverage — enable the 20.5 toggle in-suite and assert ingestion ran and availability flipped for covered channels.
- [ ] **20.10.6** Dirty-mode run — re-run the full flow in dirty mode and assert identical outcomes — the tolerance layer proven at integration level.
- [ ] **20.10.7** Classification coverage — assert each simulated failure yields its exact taxonomy kind at the client boundary.
- [ ] **20.10.8** Local script — wire `npm run test:integration` to start the server, run the suite, and tear down — Actions-free by design, listed in the release checklist.
- [ ] **20.10.9** Route docs — document the mock server's routes and control headers in `tests/mock-xtream/README.md` for future phase authors.
- [ ] **20.10.10** Phase gate — run the standing verification checklist plus this suite against built `dist/` and record the results (timings, budgets) in this phase file before merge.
