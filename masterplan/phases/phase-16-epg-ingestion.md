# Phase 16 — EPG Ingestion

> **Epic goal:** XMLTV in (URL or file, gzipped or plain), normalized programs out — parsed off the main thread in a worker, stored for indexed range queries, and pruned aggressively so EPG data never outgrows its usefulness.
> **Verification:** The generated 1,000-channel / 3-day XMLTV fixture (plain and gzipped) imports through the worker in < 5 s with the main thread responsive; `epgGetRange` returns start-sorted rows via `IDBKeyRange` on the full tier; programs older than 24 h are pruned with counts reported in the sources view; a CORS-blocked EPG URL shows its classified, non-blocking error on built `dist/`; `npm test` (including the storage matrix over the new EPG stores), `npm run build`, `npx tsc --noEmit`, and ESLint are all green.
> **Status:** `superseded` · tracker: `not-maintained` — Superseded by **Phase 31**, which `src/epg/README.md` records directly: the store was built across "Phase 16 (ingestion, superseded) and Phase 31 (the country catalog and matcher)." The XMLTV parser, gzip handling and pruning live on in `src/epg/xmltv.ts` and `prune.ts`; this phase's own EPG-source management and incremental-refresh design was replaced by `feed-fetch.ts`'s TTL-plus-conditional-GET policy.

Before this phase, ThunderTV is a complete M3U daily driver (Phases 06–15): playlists import, persist, refresh, and play, but no channel knows what is on the air — there is no `src/epg/` at all. After this phase, XMLTV feeds attach to sources (global URLs, per-playlist associations, file uploads), a dedicated Web Worker parses them with the same chunked protocol as the M3U worker, programs land in `epgChannels`/`epgPrograms` sorted by `[channelId, start]`, a tvg-id index answers "does this channel have guide data?" in O(1), and prune/horizon policies keep storage bounded. Nothing renders yet — Phase 17 owns display; this phase delivers the data spine it consumes.

## Feature 16.1 — XMLTV worker parser

The XMLTV parser is a Web Worker with a chunked, typed message protocol — the same architecture as the Phase 06 M3U worker and the ported concept from thunder-tv's `epg-parser.worker.ts`. A 100 MB guide must never block the main thread or arrive as one giant message.

- [ ] **16.1.1** Worker scaffold — create `src/epg/xmltv.worker.ts` as a Vite module worker, registered the same way as the M3U parser worker.
- [ ] **16.1.2** Typed protocol — define `src/epg/worker-protocol.ts` (`WorkerIn: {type:'parse', text|buffer, sourceId}`; `WorkerOut: 'progress' | 'channels-chunk' | 'programs-chunk' | 'summary' | 'error'`) imported by both worker and main thread, per §6.9.
- [ ] **16.1.3** Forward-only tokenizer — implement a streaming scanner over `<channel>` and `<programme>` elements in `src/epg/xmltv-tokenizer.ts` without building a DOM tree, keeping peak memory bounded on 100 MB feeds.
- [ ] **16.1.4** Channel chunks — emit epg channel records (`{id, displayName, icon}`) in chunks of ~1,000 before any programme parsing begins, so the channel index can build early.
- [ ] **16.1.5** Programme chunks — emit normalized programme rows in chunks of ~5,000 with `done` flags, mirroring the `CHUNK` protocol from §5.10.
- [ ] **16.1.6** Bounded progress — post `progress` messages (bytes consumed, element counts) at most every ~250 ms of parse work, driving one Spektrum progress value on the main thread.
- [ ] **16.1.7** Streaming receiver — implement `src/epg/ingest.ts` on the main thread that writes each chunk to the storage adapter as it arrives, never accumulating the whole feed in one array.
- [ ] **16.1.8** Malformed-element resilience — skip unclosed programmes and stray text nodes, count them, and keep parsing instead of aborting the feed.
- [ ] **16.1.9** File-size discipline — keep `xmltv.worker.ts` and `ingest.ts` each under 300 lines by holding all scanning logic in the tokenizer module.
- [ ] **16.1.10** Tokenizer unit tests — cover entities (`&amp;`), CDATA sections, multiple `display-name` elements, and self-closing tags against a small committed fixture.

## Feature 16.2 — gzip support

Real-world XMLTV lives behind `.xml.gz` URLs and mislabeled content types. Decompression must stream through `DecompressionStream('gzip')` where available and degrade gracefully on engines that lack it (older webOS), without ever entering the initial bundle.

- [ ] **16.2.1** Magic-byte detection — detect gzip by the `0x1f 0x8b` prefix on the fetched payload, never by URL extension or `Content-Type`.
- [ ] **16.2.2** Streaming gunzip — implement `src/epg/gunzip.ts` piping the response body through `new DecompressionStream('gzip')` and feeding decoded text into the worker incrementally.
- [ ] **16.2.3** Capability probe — feature-detect `DecompressionStream` once at module load and record the result on the platform capabilities object.
- [ ] **16.2.4** Inflate fallback — lazy `import()` a small inflate library (e.g. `fflate`) as its own chunk for engines without `DecompressionStream` — never shipped in the initial ≤60 KB budget.
- [ ] **16.2.5** File-upload parity — route dropped/selected `.gz` files through the same magic-byte detection so `guide.xml.gz` uploads behave identically to URLs.
- [ ] **16.2.6** Double-decompression guard — when the server already decoded via `Content-Encoding: gzip`, the payload magic-byte check decides, so plain XML is never fed to the inflater.
- [ ] **16.2.7** Transferable chunks — pass decoded data to the worker as transferable `ArrayBuffer`s where possible instead of one giant string copy.
- [ ] **16.2.8** Truncation safety — a mid-stream decompression failure marks the import failed and preserves the previously stored EPG data, never committing a half-imported source.
- [ ] **16.2.9** gunzip unit tests — round-trip a gzipped fixture and assert the classified failure on an intentionally truncated one.
- [ ] **16.2.10** Support notes — document the engine-support/fallback decision in a comment block in `gunzip.ts` and in this phase file's decision notes.

## Feature 16.3 — Program normalization

Raw XMLTV programmes become flat, small `EpgProgram` rows with UTC epoch-ms times — the normalization logic ported from thunder-tv's EPG worker, trimmed of Electron plumbing. Everything downstream (binary search, pruning, display) depends on these rows being clean and sorted-comparable.

- [ ] **16.3.1** Date parser — implement `parseXmltvDate()` in `src/epg/normalize.ts` converting `YYYYMMDDHHMMSS ±HHMM` to UTC epoch ms, treating a missing offset as UTC (documented decision).
- [ ] **16.3.2** Flat row shape — normalize each programme into `EpgProgram {channelId, start, stop, title, desc, category, icon}` — plain numbers and strings, no nested objects.
- [ ] **16.3.3** Stop derivation — when `stop` is absent, derive it from the next programme's start on the same channel; drop trailing programmes with no derivable stop.
- [ ] **16.3.4** Variant selection — pick one title/desc/category when multiple language variants exist (first entry wins), kept as a pure function so future i18n can swap the policy.
- [ ] **16.3.5** Description cap — truncate `desc` to a bounded length (~2,000 chars) at normalization time so stored rows stay small.
- [ ] **16.3.6** Invalid-duration filter — discard zero/negative-duration programmes and any whose `stop < start` after offset math, counting them for the summary.
- [ ] **16.3.7** Icons stay lazy — keep `icon` as a URL string only; nothing is fetched at ingestion time (lazy `<img>` at render).
- [ ] **16.3.8** Port provenance — port the normalization rules from thunder-tv's `epg-parser.worker.ts` and note in code which behaviors were kept versus dropped.
- [ ] **16.3.9** Date-parser tests — cover `+0000`, `-0500`, `+0530`, missing offset, and timestamps straddling a DST boundary.
- [ ] **16.3.10** Derivation tests — cover stop-derivation chains and multi-language variant selection with fixture programmes.

## Feature 16.4 — EPG storage layout

`epgChannels` and `epgPrograms` join the storage schema exactly as the plan's §5 table reserves them: programs keyed `[channelId, start]` so an `IDBKeyRange` cursor walk returns a channel's time window already sorted by start. All three tiers implement the same interface; EPG bulk data itself is full-tier only.

- [ ] **16.4.1** Schema bump — add `epgChannels` (key `id`) and `epgPrograms` (key `[channelId, start]`) stores to the IDB schema version in `src/core/storage/idb.ts`.
- [ ] **16.4.2** Adapter methods — extend `StorageAdapter` with `epgPutChannels(chunk)`, `epgPutPrograms(chunk)`, and `epgGetRange(channelId, from, to)`, implemented by all three tiers.
- [ ] **16.4.3** Range queries — implement full-tier `epgGetRange` with `IDBKeyRange.bound([channelId, from], [channelId, to])` so one cursor walk yields a start-sorted slice.
- [ ] **16.4.4** Memory reference — implement the memory tier with per-channel arrays kept start-sorted via binary-search insertion; it is the reference behavior the IDB tier must match.
- [ ] **16.4.5** Partial-tier policy — the localStorage tier stores only EPG source definitions; `epgGetRange` returns empty and callers re-fetch or skip EPG, per the plan's §5 degradation rules.
- [ ] **16.4.6** Chunked writes with backpressure — bulk-put ~5,000 rows per transaction and await `tx.oncomplete` before requesting the next worker chunk.
- [ ] **16.4.7** Idempotent puts — rely on `put` over `[channelId, start]` keys so re-importing the same feed replaces rows without a delete-all pass.
- [ ] **16.4.8** Source metadata — keep a per-source `epgMeta` record (`sourceId`, `url`, `lastFetch`, `channelCount`, `programCount`, `etag`/`lastModified`).
- [ ] **16.4.9** Storage matrix — run the shared storage test suite (memory + IDB via `fake-indexeddb`) over the new EPG methods so every tier passes one suite.
- [ ] **16.4.10** Round-trip check — import the 3-day / 1,000-channel fixture and assert `epgGetRange` for a random channel returns rows sorted by start with exact expected counts.

## Feature 16.5 — Pruning policy

EPG data grows without limit unless every import cuts it back. The policy is fixed: drop programs ending more than 24 h ago on every import, never store beyond a ~3-day horizon, and report the counts so ingestion quality is visible.

- [ ] **16.5.1** Past-cutoff prune — implement `src/epg/prune.ts` deleting programs with `stop < now − 24h` across all channels on every import completion.
- [ ] **16.5.2** Horizon cap at the gate — the normalizer drops programmes starting later than `now + 3 days` before they ever reach the worker's output chunks.
- [ ] **16.5.3** Full-tier delete — prune via one `IDBKeyRange` upper-bound cursor delete per channel, batched into bounded transactions.
- [ ] **16.5.4** Memory-tier slice — prune per-channel sorted arrays with a single binary-search cut point per channel, in place.
- [ ] **16.5.5** Prune counts — report `{droppedPast, droppedBeyondHorizon}` in the import summary and persist them onto `epgMeta`.
- [ ] **16.5.6** Boot-time sweep — schedule a light prune at app boot so stale sessions without a fresh import still shed old programs.
- [ ] **16.5.7** Visible reporting — show pruned/kept counts on the EPG source row in the sources view, with all labels through the central strings module.
- [ ] **16.5.8** Never per-tick — assert pruning runs only at import and boot, keeping the Phase 17 global 30 s tick free of storage work.
- [ ] **16.5.9** Boundary tests — cover a program ending exactly at `now − 24h`, one spanning the cutoff, and one starting exactly at the horizon.
- [ ] **16.5.10** Prune benchmark — time the prune over the 16.9 large fixture (target well under 1 s) and record the number in this phase file.

## Feature 16.6 — EPG source management

EPG sources are first-class: global XMLTV URLs in settings, per-playlist associations flowing from Phase 15's sources model and Phase 14's `&epg=` bookmark parameter, plus the `url-tvg` hints the M3U parser already captures. Definitions are small valuable data and persist on every durable tier.

- [ ] **16.6.1** Source model — extend the playlists/sources model with an optional `epgUrl` per playlist plus a global `epgSources: string[]` setting.
- [ ] **16.6.2** Settings section — add an EPG sources block to Settings → Streaming: list global XMLTV URLs with add/remove and a per-source "Refresh now" action.
- [ ] **16.6.3** Bookmark wiring — honor the connect bookmark's `&epg=` parameter (Phase 14) by writing it into the playlist's `epgUrl` during `upsertSourceFromParams`.
- [ ] **16.6.4** url-tvg suggestion — surface the `url-tvg`/`x-tvg-url` header the M3U worker summary captured as a one-click "use this guide" suggestion on the playlist.
- [ ] **16.6.5** Core-only fetches — route all EPG downloads through `core/http`'s `classifiedFetch` with the proxy template applied; no `fetch` outside `src/core/` (lint fence).
- [ ] **16.6.6** URL dedup — two playlists referencing the same XMLTV URL share one `epgMeta` record and one fetch, keyed by normalized URL.
- [ ] **16.6.7** Tier persistence — persist EPG source definitions on both full and partial tiers even though program bulk data is full-tier only.
- [ ] **16.6.8** Status display — show per-EPG-source status in the sources view: last fetch time, channel/program counts, and the last error classification.
- [ ] **16.6.9** In-flight guard — make "Refresh EPG" a no-op with a visible "importing…" state while an import runs, so repeated clicks never pile up.
- [ ] **16.6.10** Wiring tests — unit test the dedup keying and the `&epg=` bookmark path against `upsertSourceFromParams`.

## Feature 16.7 — Incremental EPG refresh

Refreshing a guide must not wipe and rebuild the world. Conditional GET skips unchanged feeds entirely (§6.6), and a changed feed replaces programs per channel window — channels absent from the new payload keep their data, and the UI never sees a half-imported state.

- [ ] **16.7.1** Conditional GET — send `If-None-Match`/`If-Modified-Since` from `epgMeta`; a `304` skips parse and storage entirely, updating only `lastFetch`.
- [ ] **16.7.2** Per-channel window replace — for each channel present in the new feed, delete `[channelId, from]`–`[channelId, horizon]` then bulk-put the fresh rows; absent channels remain untouched.
- [ ] **16.7.3** Atomic per channel — run each channel's delete-range + put inside the same transaction batch so an interrupted refresh never leaves a channel half-empty.
- [ ] **16.7.4** No half-states — keep the app fully usable during refresh and publish updated EPG to consumers only after the worker's `summary` message.
- [ ] **16.7.5** Refresh accounting — track `refreshedChannels`/`skippedChannels` in the summary for the sources view.
- [ ] **16.7.6** Staleness policy — auto-refresh an EPG source when it is opened and `lastFetch` is older than a configurable window (default 6 h), mirroring the playlist staleness policy from Phase 15.
- [ ] **16.7.7** Abort support — cancel a running refresh via `AbortController` when its source is removed; partially written chunks are cleaned by the next prune.
- [ ] **16.7.8** Concurrency guard — hold an in-flight map keyed by source id so the same source can never refresh twice concurrently.
- [ ] **16.7.9** Replacement tests — unit test the window replacement on the memory tier: old rows gone, new rows present, untouched channels intact.
- [ ] **16.7.10** 304 verification — manually verify the unchanged-server path performs zero storage writes, observed via a dev-build write counter, and note it here.

## Feature 16.8 — tvg-id channel index

One in-memory Map from normalized EPG channel id to its record makes every downstream lookup — availability flags, auto-matching, enrichment — an O(1) hit. It lives in module memory, never in Spektrum state, and rebuilds from storage without any network.

- [ ] **16.8.1** Index module — build `src/epg/channel-index.ts`: a `Map<string, EpgChannel>` rebuilt from storage at boot and after each import summary.
- [ ] **16.8.2** Shared normalizer — implement one `normalizeEpgId()` (trim, lowercase) used by the index and later by Phase 18 matching — one definition, imported everywhere.
- [ ] **16.8.3** O(1) resolution — resolve a channel row's `tvg-id` to its EPG channel via the Map; no scans, ever.
- [ ] **16.8.4** Mapping seam — leave a documented hook so Phase 18's manual-mapping table is consulted before the raw tvg-id lookup once it exists.
- [ ] **16.8.5** Module memory only — keep the index out of Spektrum state per §5.8 (it can exceed thousands of entries); publish only derived booleans/counts.
- [ ] **16.8.6** Availability API — expose `hasEpg(channelKey): boolean` as the primitive Phase 17.7's per-channel availability flag consumes.
- [ ] **16.8.7** Rebuild timing — rebuild once on `summary`, not per chunk; document that channel chunks always precede programme chunks so this is safe.
- [ ] **16.8.8** Derived, not persisted — persist nothing extra; the index derives entirely from `epgChannels`, so a full-tier boot rebuilds it offline.
- [ ] **16.8.9** Collision tests — unit test case-differing id collisions after normalization and clean lookup misses.
- [ ] **16.8.10** Rebuild benchmark — assert the index rebuild for 10,000 EPG channels stays under 50 ms and record the measured number.

## Feature 16.9 — Large-EPG performance fixture

Budgets are only real when measured. A generated multi-day, thousand-channel XMLTV benchmark (plain and gzipped) proves ingestion meets the §3 performance class and sizes the chunking constants with data instead of guesses.

- [ ] **16.9.1** Fixture generator — write `scripts/gen-epg-fixture.mjs` producing a synthetic XMLTV: 1,000 channels × 3 days × ~30-min programmes (~144k rows), in plain and gzipped variants.
- [ ] **16.9.2** Keep git lean — generate on demand into a gitignored `fixtures/` directory; only the tiny unit-test fixtures are committed.
- [ ] **16.9.3** Timed parse test — add a Vitest bench asserting full worker parse + normalize of the fixture completes within the same budget class as the 100k-channel M3U import (< 5 s, §3).
- [ ] **16.9.4** Main-thread audit — profile ingestion with a long-task observer manually and confirm chunked writes keep the UI responsive throughout.
- [ ] **16.9.5** Memory note — record rough peak worker memory during the run (via `performance.memory` where available) in this phase file.
- [ ] **16.9.6** Backpressure proof — verify the bounded outstanding-chunk count holds: storage write latency must never let worker messages queue unbounded.
- [ ] **16.9.7** gzip end-to-end — run the gzipped variant through `DecompressionStream` streaming and time the delta versus plain.
- [ ] **16.9.8** Count reconciliation — assert post-import storage row counts equal generator counts minus prune/horizon drops, exactly.
- [ ] **16.9.9** Chunk sizing — try 2.5k / 5k / 10k rows per transaction against the fixture, keep the fastest, and note the decision beside this task.
- [ ] **16.9.10** Release hook — expose the benchmark as `npm run bench:epg` so it reruns during the §3 manual budget checks before each release.

## Feature 16.10 — EPG ingestion error surfaces

Bad XML, dead URLs, and CORS walls are normal weather for EPG feeds. Every failure is classified (building on §5.2's `classifiedFetch`), rendered with its specific explanation and alternatives, and never blocks the channel list or destroys previously stored guide data.

- [ ] **16.10.1** Error union — define `src/epg/errors.ts` with kinds `'cors-or-network' | 'http' | 'timeout' | 'gzip' | 'xml' | 'empty'`, built on `core/http`'s classification.
- [ ] **16.10.2** Worker error protocol — XML failures cross the worker boundary as `{type:'error', message, line?}` messages, never as thrown exceptions.
- [ ] **16.10.3** CORS explanation — render the specific CORS message with working alternatives (download-and-upload the XMLTV file, configure the proxy) using the same surface as Phase 07 playlist imports.
- [ ] **16.10.4** Non-blocking guarantee — a failed EPG import leaves the channel list untouched and keeps serving previously stored programs.
- [ ] **16.10.5** Empty classification — a feed that parses but yields zero programmes (auth walls returning HTML often do) classifies as `'empty'` with its own message.
- [ ] **16.10.6** Persistent lastError — store `{kind, at, httpStatus?}` on `epgMeta` and render it on the source row in the sources view.
- [ ] **16.10.7** Strings module — route every error string through the central strings module; hardcoded literals are a review reject.
- [ ] **16.10.8** Redaction seam — never log an EPG URL that may embed credentials; pass through the redacting-logger seam (stubbed here, completed in Phase 23).
- [ ] **16.10.9** Classification tests — assert a bad-XML fixture classifies `'xml'` with a line number and an HTML-instead-of-XML body classifies deterministically.
- [ ] **16.10.10** Built-dist smoke — on built `dist/`, verify a DNS-failing URL, a no-CORS URL, and a truncated `.gz` each show their distinct classified message.
