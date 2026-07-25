# Phase 07 — Playlist Import Flows

> **Epic goal:** Every way a playlist enters the app — file upload, paste-as-text, URL fetch — works end-to-end through the Phase 06 worker with progress, honest CORS-classified errors, idempotent upserts, and clean cancellation, on every storage tier.
> **Verification:** On the built `dist/`, all three import paths take a fixture playlist to a browsable stored source with live progress; a cross-origin URL without CORS headers shows the specific CORS explanation with working alternatives (not a generic error); importing the same URL twice yields one source; cancelling mid-import leaves storage with no partial source; the storage-matrix suite passes on memory, localStorage, and fake-IndexedDB tiers.

Before this phase the parsing engine exists but nothing feeds it — the app still opens to an empty shell. After it, the first-run import card is the front door: file, paste, and URL imports run through one shared pipeline (`fetch/read → decode → worker → chunked storage writes → source meta commit`), the CORS reality of MASTERPLAN.md §5.2/§8 is designed into the URL path, and Phase 08 has real stored channels to render.

## Feature 07.1 — First-run import card (single centered card, all import paths + connect-bookmark hint)

The plan's §9 mandates no dashboard and no hero: an empty app shows exactly one centered card that gets a playlist in, and mentions the connect-bookmark shortcut that skips typing entirely on a TV.

- [ ] **07.1.1** Create the `src/ui/views/import-card.html` partial rendered on the home route behind `data-if` when the sources count is zero — the card is the entire first-run experience.
- [ ] **07.1.2** Lay out the three M3U paths — file picker button, paste textarea toggle, URL field — as one vertical card styled purely from `tokens.css` custom properties, dark theme default, no transitions.
- [ ] **07.1.3** Render an Xtream entry as a visible but disabled stub labeled via the strings module ("Xtream Codes — coming soon"), keeping the card's final shape stable until Phase 19 activates it; note the decision.
- [ ] **07.1.4** Add the connect-bookmark hint line per plan §7 — one sentence explaining that a `#/connect` link configures this device in one visit — with the copy sourced from the strings module.
- [ ] **07.1.5** Route every string on the card through the central strings module; a grep for hardcoded UI literals in `import-card.html` and its TS module must come back empty.
- [ ] **07.1.6** Make the card fully keyboard-operable — logical tab order across the three paths, Enter activates the focused control, and the `/` search shortcut is not registered while the card is the active view.
- [ ] **07.1.7** Show the storage-tier notice inside the card when the boot probe selected `partial` or `none` — the one-line "storage limited on this device" message from plan §5, so expectations are set before the first import.
- [ ] **07.1.8** Swap the card for the channel list the moment the first source's summary lands — a Spektrum `computed` over the sources count drives the `data-if`, no manual navigation required.
- [ ] **07.1.9** Bind card actions with `data-action` handlers that dispatch into the shared import pipeline module (`src/m3u/import.ts`) — the card owns zero import logic itself.
- [ ] **07.1.10** Add a rendered-DOM smoke test asserting the three import paths, the disabled Xtream stub, and the connect hint are all present in the empty state, and that the card is gone once a source exists.

## Feature 07.2 — File upload import (via FileAdapter)

File upload is the first always-working, CORS-free path (plan §8.1) — and the only path that must survive the `no-restricted-globals` fence, so all file access flows through the platform adapter.

- [ ] **07.2.1** Extend `FileAdapter` in `src/core/platform/` with `pickTextFile(accept): Promise<{ name; text } | null>` — the `<input type="file">` element lives inside the adapter, never in `src/ui/`, per the lint fences from Phase 03.
- [ ] **07.2.2** Set the accept filter to `.m3u,.m3u8,.txt` but never trust the extension — the pipeline sniffs for `#EXTM3U`/`#EXTINF` content before invoking the worker.
- [ ] **07.2.3** Decode file bytes inside the adapter with `TextDecoder('utf-8', { fatal: false })` and strip a leading BOM, honoring the decoding boundary defined in Feature 06.7.
- [ ] **07.2.4** Keep a 100 MB file read non-blocking — `File.text()` is async by nature; the import state enters `reading` immediately so the UI shows activity before parsing even starts.
- [ ] **07.2.5** Feed the shared pipeline with `type: 'm3u-file'` and the filename as the default source name, minting the source id before the worker call so chunk writes are keyed from the start.
- [ ] **07.2.6** Mark `m3u-file` sources with a `needsReupload` flag on the partial tier — source definitions survive in localStorage but rows do not, so boot must prompt for the file again (plan §5 degradation).
- [ ] **07.2.7** Support drag-and-drop onto the import card — `dragover`/`drop` handlers delegate the dropped `File` to the same adapter entry point, one code path for both gestures.
- [ ] **07.2.8** Classify file-level failures distinctly — empty file, undecodable content, and content that fails the M3U sniff each get their own strings-module message instead of one generic failure.
- [ ] **07.2.9** Add an integration test running a fixture file through adapter → pipeline → worker → `MemoryStorage`, asserting stored row count, group count, and source meta.
- [ ] **07.2.10** Verify the fence holds — an ESLint check (or grep test) proving no `input[type=file]` creation and no `FileReader` usage exists outside `src/core/platform/`.

## Feature 07.3 — Paste-as-text import

Paste is the zero-infrastructure import: no file manager, no CORS, works on a locked-down TV browser — and it must not smuggle a multi-megabyte string through Spektrum's recorded state on the way in.

- [ ] **07.3.1** Use an uncontrolled `<textarea>` read imperatively on submit — no `data-model` binding, so a 100 k-line paste never enters Spektrum state or its time-travel history (§5.8); record the decision.
- [ ] **07.3.2** Validate before parsing — the text must contain `#EXTM3U` or at least one `#EXTINF`; otherwise show a friendly "this doesn't look like an M3U playlist" message and keep the textarea content intact.
- [ ] **07.3.3** Create the source with `type: 'm3u-text'` and a default name of "Pasted playlist" plus the import date, since paste has no filename or URL to name it from.
- [ ] **07.3.4** Add a soft size guard — pastes beyond ~50 MB get a confirm step warning about parse time, but are never refused (the worker can take it).
- [ ] **07.3.5** Highlight in the card copy that paste (like file) never touches the network — this is the §8.1 always-working path and the UI should say so where CORS errors point users here.
- [ ] **07.3.6** Clear the textarea only after a successful summary; on worker error the text stays so the user can fix and retry without re-pasting.
- [ ] **07.3.7** Honor "parse once" — the raw pasted text is discarded after the parse; on the partial tier an `m3u-text` source cannot re-fetch, so boot marks it `needsReupload` with re-paste wording; note the behavior.
- [ ] **07.3.8** Route paste through the exact same `importPlaylistText(text, meta)` pipeline function in `src/m3u/import.ts` as file and URL — one pipeline, three entrances.
- [ ] **07.3.9** Unit-test the validation heuristics — header-less but `#EXTINF`-bearing text passes, JSON/HTML/binary pastes are rejected with the right message key.
- [ ] **07.3.10** Add a keyboard-flow test — focus textarea, paste via clipboard event, submit with Ctrl+Enter — asserting the import starts without a pointer.

## Feature 07.4 — URL import with classified CORS/network/HTTP errors and actionable alternatives

A static Pages app cannot proxy, and `fetch` collapses CORS, DNS, and offline into one opaque `TypeError` — §5.2's `classifiedFetch` turns that into specific, honest UX with working alternatives instead of a dead-end "network error".

- [ ] **07.4.1** Fetch playlist URLs exclusively through `core/http`'s `classifiedFetch` with its 15 s `AbortSignal.timeout`, returning the `ok | http | timeout | cors-or-network` result union from MASTERPLAN.md §5.2.
- [ ] **07.4.2** Render the `cors-or-network` case (when `navigator.onLine` and the URL is cross-origin) as the specific CORS explanation with two actionable alternatives — "download the file and upload it here" and "configure a proxy in Settings → Streaming" — per §8.2.
- [ ] **07.4.3** Map the `http` case to status-specific messages — 401/403 (credentials or blocked), 404 (check the URL), 5xx (provider down, retry later) — each a distinct strings-module key.
- [ ] **07.4.4** Give the `timeout` case a one-click retry affordance that re-runs the same import with the same source id.
- [ ] **07.4.5** Pre-check mixed content before fetching — an `http://` playlist URL on the `https://` Pages origin is silently blocked by the browser, so detect it first (§5.9 helper) and explain, mentioning the desktop build has no such limit.
- [ ] **07.4.6** On success, decode `res.text()` and run the shared pipeline with `type: 'm3u-url'`, defaulting the name via the ported `getFilenameFromUrl`.
- [ ] **07.4.7** Capture `ETag` and `Last-Modified` response headers into the source meta now, so Phase 15's conditional refresh (§6.6) can send `If-None-Match`/`If-Modified-Since` without a schema change.
- [ ] **07.4.8** Never trust `Content-Type` — some providers serve M3U as `text/html` or `application/octet-stream`; the same content sniff as the file path decides.
- [ ] **07.4.9** Redact credentials embedded in playlist URLs (`user:pass@`, `?username=…&password=…`) from every diagnostic string and console line — URLs are logged only through a redacting helper.
- [ ] **07.4.10** Unit-test each failure class with a mocked `fetch` — assert the exact classified message key and offered actions per class, including the cross-origin flag governing CORS wording.

## Feature 07.5 — Import progress UI driven by worker progress events

A 100 k-channel import takes seconds — the difference between "broken" and "working hard" is a progress surface fed by the worker's chunked protocol, while the app stays fully interactive.

- [ ] **07.5.1** Model progress as compact Spektrum scalars — `import.state` (`idle | fetching | reading | parsing | writing | done | error`), `import.parsed`, `import.written`, `import.sourceName` — defined in a `state/import` module.
- [ ] **07.5.2** Map worker `progress` events to `setValue('import.parsed', n)` in the parser client — a value update per `CHUNK` rows, roughly 20 updates for 100 k, no throttling needed beyond the protocol's own cadence.
- [ ] **07.5.3** Increment `import.written` as each chunk's storage write resolves, so the bar reflects durable progress, not just parse progress.
- [ ] **07.5.4** Render the bar as a width style computed from the scalars — instant updates, and since totals are unknown mid-parse, show a row-count readout ("12 400 channels…") rather than a fake percentage.
- [ ] **07.5.5** Label the current stage from the strings module ("Fetching…", "Parsing…", "Saving…") keyed off `import.state`.
- [ ] **07.5.6** Disable all import submit controls while `import.state` is non-idle — one import at a time, matching the parser client's single-flight rule from Feature 06.3.
- [ ] **07.5.7** Transition to `error` renders the classified message inline in the card, replacing the progress bar, with the retry/alternative actions from Feature 07.4.
- [ ] **07.5.8** Keep rows out of state — assert in a test that during a full import no Spektrum value ever holds an array of channel rows, only the scalar counters (§5.8 discipline).
- [ ] **07.5.9** Manually verify interactivity on the built `dist/` — scroll and open the settings panel while a 100 k import runs; record the observation in this phase file.
- [ ] **07.5.10** Add a Playwright test importing the 10 k generated fixture and asserting the state sequence `parsing → writing → done` with monotonically increasing `import.parsed` readouts.

## Feature 07.6 — Import result summary (channel/group counts, radio count)

The moment after import is where trust is built: show exactly what was understood — channels, groups, radio stations, skipped garbage — and offer one obvious next step.

- [ ] **07.6.1** Render a result panel from the worker `summary` message — total channels, group count, and `radioCount` — replacing the progress surface on `done`.
- [ ] **07.6.2** Surface the `skipped` count from Feature 06.7's tolerance policy when non-zero ("312 unreadable entries skipped"), so silent data loss never happens.
- [ ] **07.6.3** Show `drmCount` when non-zero with the honest caveat that DRM-protected channels are detected but not playable in v1 (plan non-goals), phrased via the strings module.
- [ ] **07.6.4** Tease detected EPG sources — when `extractM3uEpgUrls` found header URLs, show "N EPG sources detected" as informational copy; actual EPG import is Phase 16's job.
- [ ] **07.6.5** Make "Open channel list" the primary action, navigating the hash router to the new source's list view.
- [ ] **07.6.6** Persist the counts onto the source meta record (`count`, `groupCount`, `radioCount`, `lastRefresh`) — the Phase 15 sources view reads them without touching channel rows.
- [ ] **07.6.7** Add a dev-mode consistency assertion behind the summary — group counts plus `Ungrouped` sum to the channel total, catching mapper/group drift the moment it appears.
- [ ] **07.6.8** Clear the summary state on navigation away, returning the import card (if no other flow replaced it) to its idle layout.
- [ ] **07.6.9** Cover pluralized summary lines in the strings module with a simple count-aware format helper — "1 group" vs "245 groups" — shared with Phase 09's result counts.
- [ ] **07.6.10** Unit-test the summary rendering against a fixture parse with known counts, including the zero-radio and zero-skipped cases that must hide their lines entirely.

## Feature 07.7 — Duplicate-source detection and idempotent upsert (keyed type+url)

Importing the same URL twice must update one source, not breed clones — the same identity rule the Phase 14 connect bookmarks and §5.6's upsert depend on, defined once here.

- [ ] **07.7.1** Implement `makeSourceKey(type, url, user?)` in `src/core/connect/source-key.ts` — normalized identity per §5.6 (`type+url`, later `+user` for Xtream) — shared by import flows now and connect-URL consumption in Phase 14.
- [ ] **07.7.2** Normalize URL keys deliberately — trim, lowercase scheme and host, strip trailing slash, preserve path/query case — with unit tests for each rule and an `http`/`https` distinction kept intact.
- [ ] **07.7.3** On URL import of an existing key, update in place — re-parse, replace rows, refresh meta — never create a second source; the summary says "updated" instead of "imported".
- [ ] **07.7.4** Implement replace as write-then-swap — new rows are written under a staging playlist id, then the source meta atomically repoints and old rows are deleted, so a crash mid-replace never leaves a half-empty visible source; note the design.
- [ ] **07.7.5** Keep favorites working across an upsert — they are denormalized snapshots by design (plan §5), so verify with a test that a favorite from the old rows still renders and plays after its source was re-imported.
- [ ] **07.7.6** For file/paste imports (no reliable URL key), compute a cheap content fingerprint (byte length + hash of the first 64 KB) and warn "this looks identical to <name>" with an explicit "import anyway" choice — never silently dedupe.
- [ ] **07.7.7** Update `importDate` only on creation and `lastRefresh` on every upsert, so the sources view can distinguish "added" from "last refreshed".
- [ ] **07.7.8** Reject a concurrent import of the same key while one is running — surfaced as a strings-module notice, backed by the single-flight parser client.
- [ ] **07.7.9** Add an IDB-tier integration test (fake-indexeddb): import the same URL twice, assert exactly one `playlists` record, fresh `channels` rows, and no orphaned staging rows.
- [ ] **07.7.10** Expose the upsert as the single entry point `upsertSourceFromImport(meta, parseResult)` so the Phase 14 connect flow and Phase 15 refresh reuse it byte-for-byte.

## Feature 07.8 — Proxy setting applied to the import path

The optional user-configured proxy (plan §8.3) is the only URL-import escape hatch on the pure web target — applied inside the http adapter so no caller ever builds proxied URLs by hand.

- [ ] **07.8.1** Add the `proxyUrlTemplate` setting (e.g. `https://my-proxy/{url}`) to Settings → Streaming, persisted through the settings store and mirrored into Spektrum state at boot.
- [ ] **07.8.2** Apply the template inside `core/http` only — when set, the adapter substitutes `encodeURIComponent(targetUrl)` into the `{url}` placeholder before fetching; callers keep passing plain provider URLs.
- [ ] **07.8.3** Validate the template on save — it must contain exactly one `{url}` placeholder and parse as an absolute `https:` URL; invalid input keeps the previous value with an inline message.
- [ ] **07.8.4** Ship empty by default with copy stating no public proxy is provided or promised — the plan's explicit posture.
- [ ] **07.8.5** Offer "Retry via proxy" on a CORS-classified import failure whenever a template is configured, re-running the same import through the adapter's proxied path.
- [ ] **07.8.6** Set expectations in the settings copy — the proxy applies to playlist, EPG, and API fetches, but video segments are fetched by the player engines and remain CORS-bound on the web (§8.3's note, stated verbatim in plain words).
- [ ] **07.8.7** Keep conditional-refresh headers working through the proxy — `If-None-Match` must still be attached to the proxied request so Phase 15's `304` path survives proxying.
- [ ] **07.8.8** Redact the proxy URL itself in diagnostics — templates often embed access keys, so the redacting log helper masks everything past the proxy origin.
- [ ] **07.8.9** Unit-test template application — placeholder substitution, double-encoding of URLs that already contain `%`-escapes, and the no-template passthrough case.
- [ ] **07.8.10** Add an integration test with a mocked fetch asserting that with a template set, the import request goes to the proxy origin with the fully encoded target URL embedded.

## Feature 07.9 — Import cancellation and partial-write cleanup

A cancelled or crashed import must leave zero trace — chunked writes make partial state a real hazard, so the pipeline is built commit-last with a boot-time sweep as the safety net.

- [ ] **07.9.1** Add a Cancel control to the progress UI, wired per stage — an `AbortController` through `core/http` during fetch, and the parser client's `terminate()`-based `cancel()` during parse/write.
- [ ] **07.9.2** Prefer `worker.terminate()` over a cooperative cancel message — simpler, instantaneous, and the client re-instantiates the worker immediately; measure the re-instantiation cost (~ms) and record it as the decision note justifying the choice.
- [ ] **07.9.3** Tag every chunk write with the import's staging id so cleanup is a single ranged delete of that id's rows, on any tier.
- [ ] **07.9.4** Commit source meta last — the `playlists` record (or its repointed swap from Feature 07.7) is written only after the final chunk and groups land, so no half-imported source is ever visible.
- [ ] **07.9.5** On cancel, delete the staging rows, reset `import.*` state to idle, and leave the import card exactly as it was before the attempt.
- [ ] **07.9.6** Verify upsert safety under cancellation — cancelling a re-import of an existing source must leave the previous rows untouched and the source fully browsable (the write-then-swap design makes this free; prove it with a test).
- [ ] **07.9.7** Implement a boot-time sweep in the storage layer that deletes orphaned channel/group rows whose playlist id matches no `playlists` record — crash recovery for the process dying mid-import.
- [ ] **07.9.8** Make Cancel keyboard-accessible and debounced — Escape triggers it while the progress surface has focus, and double-activation is a no-op.
- [ ] **07.9.9** Add a cancellation test on the 100 k fixture — cancel mid-parse, assert idle state, zero staged rows across the storage matrix, and that an immediate second import of the same source succeeds.
- [ ] **07.9.10** Simulate a mid-import quota failure on the localStorage tier — the §5.7 guarded write demotes to memory, the import completes in-session, and the demotion notice appears without a white screen.

## Feature 07.10 — Import fixtures and integration tests across storage tiers

The import pipeline is the first feature whose correctness depends on the storage tier — this feature locks the whole flow into the storage test matrix so `memory`, `partial`, and `full` behavior can never silently diverge.

- [ ] **07.10.1** Consolidate a shared fixture index in `tests/fixtures/index.ts` — small (100 rows), medium (10 k), malformed corpus, radio-mix, and DRM-mix playlists — exported for unit, integration, and Playwright suites alike.
- [ ] **07.10.2** Run the full pipeline (`importPlaylistText` → worker → chunk writes → meta commit) against all three `StorageAdapter` implementations, with `MemoryStorage` as the reference the other two must match per §6.2.
- [ ] **07.10.3** Use `fake-indexeddb` for the full-tier suite so the IDB code paths (bulk `put` chunks, `[playlistId, index]` keys, staging deletes) run headlessly in Vitest.
- [ ] **07.10.4** Assert partial-tier semantics — after a simulated reload only source definitions survive, `m3u-url` sources re-fetch and re-parse on boot, and `m3u-file`/`m3u-text` sources surface their `needsReupload` prompt.
- [ ] **07.10.5** Assert none-tier semantics — the full import works within the session and a simulated reload comes back empty, with the app still functional (the tier changes boot behavior, never feature behavior).
- [ ] **07.10.6** Exercise the localStorage chunked-JSON writes within the ~5 MB budget — a fixture sized just under the cap persists, one just over triggers the guarded demotion path.
- [ ] **07.10.7** Add a Playwright smoke on the built `dist/` serving fixtures from a local static server — file import and URL import each land a browsable source, and the CORS path is exercised against a header-less origin.
- [ ] **07.10.8** Keep the Phase 06 protocol contract tests green from this suite's setup — the integration layer imports the same `worker-protocol.ts` types, so a protocol change breaks both suites loudly rather than one silently.
- [ ] **07.10.9** Give tests deterministic reload semantics — extend the adapters with a test-only `simulateReload()` hook that drops or preserves state exactly as a real reload would per tier.
- [ ] **07.10.10** Close the phase bookkeeping — check every box in this file, record the accumulated decision notes (Xtream stub, uncontrolled textarea, terminate-based cancel, write-then-swap), and run the standing verification checklist from MASTERPLAN.md §3.
