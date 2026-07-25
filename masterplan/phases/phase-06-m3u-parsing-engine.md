# Phase 06 — M3U Parsing Engine

> **Epic goal:** A worker-based M3U parsing engine that turns any real-world playlist — clean or broken — into structured channel rows, streamed back in ~5 000-row chunks with progress, at 100 k-channel scale within the < 5 s import budget.
> **Verification:** `npm test` green including all four ported m3u-utils spec files and the malformed-corpus suite; `npm run bench:m3u` shows a full worker round-trip (parse + map + chunk) of the generated 100 k fixture in < 5 s on the dev machine with the main thread never blocked > 50 ms; `npx tsc --noEmit` proves the worker protocol is exhaustively typed on both sides.

Before this phase the app has a shell, platform adapters, tiered storage, and Spektrum state modules (Phases 01–05) but cannot understand a single playlist. After it, `src/m3u/` contains the ported thunder-tv utilities, the patched `iptv-playlist-parser` fork wrapped behind one module, a Vite module worker speaking the typed chunked protocol from MASTERPLAN.md §6.9, and a benchmark harness that pins the 100 k budget — everything Phase 07's import flows will drive, with no UI of its own yet.

## Feature 06.1 — Port m3u-utils from thunder-tv (playlist.utils, kodiprop, catchup, strip-country-prefix + specs)

The battle-tested plain-TS utilities from thunder-tv's `libs/shared/m3u-utils/` are the parsing engine's foundation; porting them with their specs intact means Phase 06 starts from proven behavior instead of rewrites.

- [ ] **06.1.1** Create the `src/m3u/` module layout — `playlist.utils.ts`, `kodiprop.utils.ts`, `catchup.utils.ts`, `strip-country-prefix.util.ts`, `types.ts`, and a barrel `index.ts`, mirroring thunder-tv's `libs/shared/m3u-utils/src/lib/` file names so future diffs against the reference repo stay trivial.
- [ ] **06.1.2** Port `playlist.utils.ts` — `createPlaylistObject`, `getFilenameFromUrl`, `getExtensionFromUrl`, `getStreamExtensionFromUrl`, and `extractM3uEpgUrls`, rewriting every `@iptvnator/shared/interfaces` import to local `src/m3u/types.ts` definitions.
- [ ] **06.1.3** Replace the `uuid` dependency with `crypto.randomUUID()` — available in module workers and every evergreen target, keeping ThunderTV's zero-runtime-deps posture (Spektrum aside).
- [ ] **06.1.4** Port `kodiprop.utils.ts` essentially verbatim — `extractDrmFromRaw`, `isClearKeyLicenseType`, and the ClearKey normalization helpers are self-contained apart from the interface imports.
- [ ] **06.1.5** Port `catchup.utils.ts` (`getM3uArchiveDays`, `isM3uCatchupPlaybackSupported`, `resolveM3uCatchupUrl`) as the plan's explicit door-opener — exclude it from the barrel's default export path so tree-shaking keeps it out of the bundle until a catchup feature exists.
- [ ] **06.1.6** Port `strip-country-prefix.util.ts` — `stripCountryPrefix`, `applyChannelNameStrip`, and the `TAG_PREFIX_PATTERN`/`COLON_TAG_PATTERN` heuristics, unchanged; Phase 09's normalization depends on this exact behavior.
- [ ] **06.1.7** Port all four spec files (`playlist.utils.spec.ts`, `kodiprop.utils.spec.ts`, `catchup.utils.spec.ts`, `strip-country-prefix.util.spec.ts`) to Vitest, keeping every existing case — mostly a `jest`→`vi` mechanical translation.
- [ ] **06.1.8** Trim the EPG-URL selection logic — keep `extractM3uEpgUrls` (the `x-tvg-url`/`url-tvg`/`tvg-url` header extraction Phase 16 needs) but drop the region-hint `selectRecommendedEpgUrls` scoring machinery; record the trim as a decision note in this file.
- [ ] **06.1.9** Split for the ≤ 300-line rule — thunder-tv's `playlist.utils.ts` is ~455 lines, so extract the EPG-URL helpers into `src/m3u/epg-urls.util.ts` and verify every ported file passes the ESLint `max-lines` fence.
- [ ] **06.1.10** Wire `npm test` to pick up `src/m3u/**/*.spec.ts` and confirm the whole ported suite runs green before any new engine code lands on top of it.

## Feature 06.2 — iptv-playlist-parser integration (patched fork)

The patched fork `github:4gray/iptv-playlist-parser#v0.15.2-iptvnator.2` is battle-tested against real-world malformed playlists; integrating it behind a single wrapper module keeps the third-party API surface contained to one file.

- [ ] **06.2.1** Add `"iptv-playlist-parser": "github:4gray/iptv-playlist-parser#v0.15.2-iptvnator.2"` to `package.json` and verify `package-lock.json` records the resolved commit hash so installs are reproducible.
- [ ] **06.2.2** Write the single wrapper `src/m3u/parse-m3u.ts` exposing `parseM3u(text): ParsedPlaylist` — the fork's `parse()` is imported here and nowhere else in the codebase.
- [ ] **06.2.3** Add `src/m3u/iptv-playlist-parser.d.ts` typing the fork's output shape (`header.attrs`, `header.raw`, `items[].tvg/{id,name,logo,rec}`, `items[].group.title`, `items[].url`, `items[].raw`, `timeshift`, `catchup`, `radio`) if its bundled types are absent or stale.
- [ ] **06.2.4** Prove the fork bundles for the worker context — a Vite build of a throwaway module worker importing `parseM3u` must succeed with no Node built-in shims pulled in.
- [ ] **06.2.5** Verify header attribute survival — a fixture with `#EXTM3U x-tvg-url="…"` must round-trip through `parseM3u` into `header.attrs` so `extractM3uEpgUrls` keeps working.
- [ ] **06.2.6** Confirm the fork's `raw` field preserves unknown lines between `#EXTINF` and the stream URL — the contract `extractDrmFromRaw` depends on (the dominant Kodi/TiviMate layout).
- [ ] **06.2.7** Add a regression spec parsing a known thunder-tv sample playlist fixture and asserting item counts, `tvg.id`, `group.title`, and `radio` attributes match the values the reference repo expects.
- [ ] **06.2.8** Check the built chunk graph — the parser must land only in the worker chunk, never in the initial main-thread bundle (the ≤ ~60 KB gz app-code budget from MASTERPLAN.md §3).
- [ ] **06.2.9** Document in a header comment of `parse-m3u.ts` why the fork exists (malformed-playlist fixes over upstream v0.15.x) and which tag is pinned, so a future upgrade is a conscious act.
- [ ] **06.2.10** Add a lint fence (`no-restricted-imports`) rejecting `iptv-playlist-parser` imports outside `src/m3u/parse-m3u.ts`.

## Feature 06.3 — Parser worker scaffold (Vite module worker)

Parsing 100 MB playlists must never block the UI; per the standing convention "workers parse, memory queries, storage persists", a dedicated Vite module worker owns all parse work from this phase forward.

- [ ] **06.3.1** Create `src/m3u/parser.worker.ts` and instantiate it with `new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })` so Vite bundles it as a proper module-worker chunk in both dev and build.
- [ ] **06.3.2** Implement the worker entry as a single `onmessage` switch over `WorkerIn` with a top-level `try/catch` (plus a `self.onerror` trap) that always answers with a `{ type: 'error', message }` — the worker never dies silently.
- [ ] **06.3.3** Build the main-thread client `src/m3u/parser-client.ts` wrapping the worker in an `onProgress`/`onChunk`/`onSummary`/`onError` callback API plus a promise that settles on summary or error.
- [ ] **06.3.4** Enforce single-flight parsing — the client rejects a second `parse` request while one is in flight, and exposes `cancel()` which terminates and re-instantiates the worker (consumed by Phase 07's cancellation feature).
- [ ] **06.3.5** Keep the worker Spektrum- and DOM-free — add a lint fence so `parser.worker.ts` and everything it imports never touches `spektrum`, `document`, or `src/ui/`.
- [ ] **06.3.6** Delegate real work — the worker file itself stays a thin ≤ 300-line dispatcher over `parse-m3u.ts` and the `channel-mapper.ts` from Feature 06.5.
- [ ] **06.3.7** Measure the one-shot input cost — time the structured-clone of a 100 MB playlist string into the worker and record the number as a decision note (input stays a single `parse` message; only results are chunked).
- [ ] **06.3.8** Add a Vitest happy-path test driving the real worker (Vitest's worker support or a thin harness around the exported handler function) with a small fixture and asserting the progress→chunk→summary sequence.
- [ ] **06.3.9** Add an error-path test — garbage input yields exactly one `{ type: 'error' }` message and no unhandled rejection, and the worker remains usable for the next parse.
- [ ] **06.3.10** Verify dev-server behavior — HMR-restart the worker cleanly during `vite dev` so a mid-development parse never leaves a zombie worker attached to the old client.

## Feature 06.4 — Typed chunked worker protocol with progress events

MASTERPLAN.md §5.10 warns that one giant `postMessage` freezes the main thread; the fix is a typed, chunked protocol shared verbatim by worker and main thread so the compiler enforces the contract on both sides.

- [ ] **06.4.1** Create `src/m3u/worker-protocol.ts` defining the discriminated unions from MASTERPLAN.md §6.9 — `WorkerIn = { type: 'parse'; text; sourceId }` and `WorkerOut = progress | chunk | summary | error` — imported by both `parser.worker.ts` and `parser-client.ts`.
- [ ] **06.4.2** Export `export const CHUNK = 5_000` from the protocol file as the single authority on chunk size (referenced later by storage writes and the Phase 07 pipeline).
- [ ] **06.4.3** Emit `{ type: 'progress', parsed }` from inside the parse/map loop every `CHUNK` rows so a 100 k import produces ~20 evenly spaced progress messages, not a flood.
- [ ] **06.4.4** Emit channel rows as `{ type: 'chunk', rows, done }` slices of ≤ `CHUNK` rows with `done: true` on the final slice, exactly per the §5.10 pattern.
- [ ] **06.4.5** Close every parse with `{ type: 'summary', total, groups, radioCount, drmCount, skipped }` — the counts Phase 07's result summary consumes, plus the `GroupMeta[]` from Feature 06.6.
- [ ] **06.4.6** In `parser-client.ts`, write each arriving chunk straight to the `StorageAdapter` `channels` store (keyed `[playlistId, index]` per the plan's IDB layout) — rows are never accumulated into one big array on the main thread.
- [ ] **06.4.7** Route progress to Spektrum as compact scalars only — `setValue('import.parsed', n)` and friends; no row arrays ever pass through recorded state (§5.8's ~1 000-item rule).
- [ ] **06.4.8** Make both message switches exhaustive with a `never`-typed default so adding a message variant fails `npx tsc --noEmit` until both sides handle it.
- [ ] **06.4.9** Unit-test the chunk boundary math — 0 rows, exactly 5 000, 5 001, and 100 000 rows produce the correct chunk count, sizes, and a single `done: true`.
- [ ] **06.4.10** Assert protocol purity — `worker-protocol.ts` emits nothing at runtime beyond the `CHUNK` constant (types only), keeping it free to import from anywhere without bundle cost.

## Feature 06.5 — Channel row shape + createPlaylistObject port (id, name, url, group, logo, tvg-id, radio flag)

Thunder-tv nests parsed items inside a `Playlist.playlist.items` tree; ThunderTV needs flat, small `ChannelRow` objects so a 90 k-row array stays a few MB of plain memory — the query layer on every storage tier.

- [ ] **06.5.1** Define `ChannelRow` in `src/m3u/types.ts` — `id`, `name`, `url`, `group`, `logo`, `tvgId`, `radio: boolean`, optional `drm` — a flat object with no nested `tvg`/`group` wrappers and no retained `raw`.
- [ ] **06.5.2** Adapt the ported `createPlaylistObject` into `createPlaylistSource` — it now returns `{ source: PlaylistSource; rows: ChannelRow[] }` where `PlaylistSource` carries id, name, `type` (`m3u-url` | `m3u-file` | `m3u-text`), url, counts, `importDate`, and detected EPG URLs, matching the plan's `playlists` store shape.
- [ ] **06.5.3** Decide row identity and note it — storage key is `[playlistId, index]` (bulk-put friendly), `row.id` is a `crypto.randomUUID()` minted once at parse time (stable for favorites), mirroring thunder-tv's per-item uuid in `createPlaylistObject`.
- [ ] **06.5.4** Implement `src/m3u/channel-mapper.ts` mapping a fork `ParsedPlaylistItem` to `ChannelRow` — `tvg.id → tvgId`, `tvg.logo → logo`, `group.title → group`, trimmed `name` with a `getFilenameFromUrl` fallback for nameless items.
- [ ] **06.5.5** Hook `extractDrmFromRaw(item.raw)` into the mapper exactly as thunder-tv's `createPlaylistObject` does — the `drm` field is set only when extraction returns a value.
- [ ] **06.5.6** Discard `item.raw` after DRM, radio, and catchup extraction — raw M3U text never reaches storage or module memory ("parse once, read forever" without the bloat).
- [ ] **06.5.7** Run the mapper inside the worker, per chunk — rows arrive on the main thread already in final `ChannelRow` shape, ready for direct storage writes.
- [ ] **06.5.8** Port the applicable `playlist.utils.spec.ts` cases onto the new shape and add mapper specs covering nameless items, missing groups, and missing logos.
- [ ] **06.5.9** Measure per-row memory on the 100 k fixture (heap delta ÷ rows) and record the bytes-per-row figure as a decision note — the "few MB for 90 k rows" claim from the plan must hold.
- [ ] **06.5.10** Keep `channel-mapper.ts` ≤ 300 lines with pure, individually exported mapping functions so Feature 06.7's tolerance tests can target them directly.

## Feature 06.6 — Group extraction with counts and first-index

Group metadata computed once at parse time is what makes the Phase 08 group view instant — jumping to a group is a multiplication (`firstIndex × ROW_H`), never a 90 k-row scan.

- [ ] **06.6.1** Build `GroupMeta { name, count, firstIndex }` in a single pass over the mapped rows inside the worker — no second iteration over 100 k items.
- [ ] **06.6.2** Preserve playlist order of first appearance for the group list, with `firstIndex` pointing at the group's first row position in the full channel array.
- [ ] **06.6.3** Bucket rows with a missing or blank `group.title` into a single `Ungrouped` pseudo-group, appended after the real groups.
- [ ] **06.6.4** Normalize group names by trimming whitespace but keep case-sensitive identity (matching thunder-tv behavior); record the choice as a decision note.
- [ ] **06.6.5** Ship the finished `GroupMeta[]` inside the `summary` message — groups are summary payload, never their own chunk stream.
- [ ] **06.6.6** Persist groups from `parser-client.ts` into the `groups` store keyed `[playlistId, name]` per the plan's IDB layout, written after the last channel chunk lands.
- [ ] **06.6.7** Guard pathological playlists — cap distinct groups at 10 000 with overflow rows folded into `Ungrouped`, and note the cap so the Phase 08 UI can trust the bound.
- [ ] **06.6.8** Add a dev-mode invariant check that `sum(group counts) === total` (every row belongs to exactly one group, `Ungrouped` included).
- [ ] **06.6.9** Spec: an interleaved fixture (`A, B, A, C, B`) yields correct counts and `firstIndex` = the first occurrence even when a group's rows are non-contiguous.
- [ ] **06.6.10** Spec the edge cases — empty playlist yields `[]`, an all-ungrouped playlist yields exactly one bucket, and a whitespace-only `group-title` lands in `Ungrouped`.

## Feature 06.7 — Malformed-playlist tolerance (fixture corpus of real-world broken M3Us)

Real IPTV playlists are hand-edited, provider-generated garbage as often as not; the engine's contract is "never throw, always report" — salvage what parses, count what does not.

- [ ] **06.7.1** Build a fixture corpus under `tests/fixtures/m3u/malformed/` — missing `#EXTM3U` header, CRLF and lone-CR line endings, UTF-8 BOM, unbalanced attribute quotes, `#EXTINF` without a following URL, consecutive duplicate `#EXTINF` lines, binary garbage lines, and a file truncated mid-line.
- [ ] **06.7.2** Define the tolerance policy in code — unparseable lines are skipped and counted; only input that yields zero channels produces a `{ type: 'error' }` result.
- [ ] **06.7.3** Strip a leading UTF-8 BOM before handing text to `parseM3u` — the fork treats a BOM-prefixed `#EXTM3U` as a missing header otherwise.
- [ ] **06.7.4** Handle comma-less or name-less `#EXTINF` lines by falling back to `getFilenameFromUrl(item.url)` for the channel name, matching thunder-tv's untitled-fallback spirit.
- [ ] **06.7.5** Drop rows without any stream URL in the mapper and report them via the summary's `skipped` count (surfaced by Phase 07's result summary).
- [ ] **06.7.6** Verify the patched fork's raison d'être — add regression fixtures for the specific malformed shapes the `#v0.15.2-iptvnator.2` tag fixes over upstream, so a future parser swap cannot silently regress them.
- [ ] **06.7.7** Write a table-driven Vitest suite iterating the whole corpus and asserting, per file, no-throw plus the expected `{ total, skipped }` pair.
- [ ] **06.7.8** Fuzz lightly — parse random truncations of the medium fixture (seeded, ~50 cut points) and assert the worker always answers with a well-formed protocol message.
- [ ] **06.7.9** Keep decoding honest at the boundary — document that callers (Phase 07) decode bytes with `TextDecoder('utf-8', { fatal: false })` so replacement characters, not exceptions, reach the parser.
- [ ] **06.7.10** Add a one-paragraph provenance note atop the corpus directory listing where each broken shape was observed, so fixtures never rot into cargo cult.

## Feature 06.8 — DRM/KODIPROP extraction (store Channel.drm, flag unsupported schemes)

Channels carrying `#KODIPROP:inputstream.adaptive.*` lines must keep their DRM metadata through the pipeline so Phase 10 can refuse them with a clear diagnostic instead of a dead spinner — DRM playback itself stays out of v1 scope.

- [ ] **06.8.1** Port the `ChannelDrm` and `ChannelDrmClearKeys` types into `src/m3u/types.ts` and expose the optional `drm` field on `ChannelRow` end-to-end through chunks and storage.
- [ ] **06.8.2** Wire the ported `extractDrmFromRaw` into `channel-mapper.ts` so both the `license_type` + `license_key` pair and the `drm_legacy` `type|key` form are recognized, per the ported implementation.
- [ ] **06.8.3** Preserve all four ClearKey key formats from the port — single `kid:key` hex pair, comma-separated pairs, the W3C ClearKey license JSON, and the plain `{kid: key}` map — including base64url→hex normalization via `normalizeKeyComponent`.
- [ ] **06.8.4** Keep the `supported: false` contract — Widevine/PlayReady license types and license-server URLs yield `{ licenseType, supported: false }` so downstream code can name the scheme it refuses.
- [ ] **06.8.5** Simplify `decodeBase64` for ThunderTV — `atob` exists in both browsers and module workers; keep the Node `Buffer` branch only for the Vitest node environment and note the decision.
- [ ] **06.8.6** Port `kodiprop.utils.spec.ts` in full — every ClearKey format, legacy form, and unsupported-scheme case stays covered.
- [ ] **06.8.7** Add a corpus fixture with realistic TiviMate-style playlists — `#KODIPROP` lines between `#EXTINF` and the URL — and assert extraction through the whole worker pipeline, not just the util in isolation.
- [ ] **06.8.8** Assert `raw` disposal ordering — the mapper spec proves `drm` survives on the row while the `raw` block that produced it is gone from the chunked output.
- [ ] **06.8.9** Count DRM rows in the worker and ship `drmCount` in the summary for Phase 07's result panel.
- [ ] **06.8.10** Guard the logs — DRM extraction paths must never print license keys; add a spec asserting no `console.*` output contains a 32-hex-char key even with extraction failures.

## Feature 06.9 — Radio/audio channel detection (radio="true" attribute)

Radio stations need to be recognized at parse time — the flag drives the Phase 08 row template (no EPG placeholder), keeps them out of EPG expectations, and mirrors thunder-tv's `channel.radio === 'true'` convention.

- [ ] **06.9.1** Read the `radio` attribute from the parsed item (the fork surfaces it; fall back to matching `radio="true"` in the `#EXTINF` attributes if a corpus fixture shows it dropped).
- [ ] **06.9.2** Normalize to a boolean at the mapper — `'true'`/`'True'`/unquoted `true` all become `ChannelRow.radio = true`; anything else is `false` (thunder-tv stores the string; ThunderTV normalizes once).
- [ ] **06.9.3** Stay strictly attribute-based — deliberately no audio-extension URL heuristics (`.mp3`/`.aac`), avoiding false positives on video streams with odd URLs; record as a decision note.
- [ ] **06.9.4** Aggregate `radioCount` in the worker's single pass and include it in the summary message for the Phase 07 import summary.
- [ ] **06.9.5** Keep radio rows inside their declared groups — no synthetic "Radio" bucket; group semantics stay uniform for the Phase 08 group view (decision noted).
- [ ] **06.9.6** Document on the `ChannelRow.radio` JSDoc which downstream phases consume the flag (row glyph in 08, EPG exclusion in 16–17, inline-audio behavior in 10–12).
- [ ] **06.9.7** Add a mixed fixture playlist (TV + radio interleaved) asserting per-row flags and the summary `radioCount`.
- [ ] **06.9.8** Verify serialization — `radio` survives a write/read round-trip through the `MemoryStorage` reference adapter as a real boolean, not a string.
- [ ] **06.9.9** Spec attribute-position tolerance — `radio="true"` before or after `tvg-*` attributes, and with single quotes, still detects.
- [ ] **06.9.10** Confirm the flag costs nothing at scale — the 100 k benchmark fixture includes ~5 % radio rows so detection overhead is inside the Feature 06.10 measurement, not an untested path.

## Feature 06.10 — 100 k-channel performance benchmark fixture and parse-throughput measurement

The < 5 s / 100 k-channel budget from MASTERPLAN.md §3 is a release gate; this feature makes it a number the repo can reproduce on demand instead of a hope.

- [ ] **06.10.1** Write `scripts/gen-m3u-fixture.mjs` — a seeded, deterministic generator producing playlists of arbitrary size with realistic groups (~200), logos, tvg-ids, ~5 % `radio="true"` rows, and ~1 % `#KODIPROP` ClearKey blocks.
- [ ] **06.10.2** Commit the generator and its seed, never the 100 k output file — the fixture is regenerated into a git-ignored `tests/fixtures/generated/` on demand, keeping the repo compact.
- [ ] **06.10.3** Build a benchmark harness measuring the full worker round-trip — text in, last `summary` out — reporting total time and rows/second for 10 k and 100 k fixtures.
- [ ] **06.10.4** Assert the budget — the 100 k round-trip must finish in < 5 s; the harness exits non-zero past budget so the standing verification checklist has a command, not a judgment call.
- [ ] **06.10.5** Measure main-thread health during receive — a `PerformanceObserver('longtask')` in the harness page must record zero tasks > 50 ms while chunks arrive and are written to storage.
- [ ] **06.10.6** Record peak worker heap during the 100 k parse (`performance.memory` where available, manual DevTools note elsewhere) as the baseline the Phase 26 hardening pass diffs against.
- [ ] **06.10.7** Compare `CHUNK` candidates 1 000 / 5 000 / 10 000 on the 100 k fixture (total time, message count, longest main-thread task) and record the chosen trade-off as a decision note next to the `CHUNK` constant.
- [ ] **06.10.8** Verify progress cadence — the harness asserts progress messages arrive roughly every `CHUNK` rows with no burst at the end (UI smoothness for Phase 07's progress bar).
- [ ] **06.10.9** Expose the harness as `npm run bench:m3u` and document in this phase file how to run it against the built `dist/`, not the dev server.
- [ ] **06.10.10** Add a small always-on guard — a Vitest perf smoke parsing the 10 k fixture under a generous ceiling (e.g. 2 s) so CI-less local runs still catch order-of-magnitude regressions without flaky tight bounds.
