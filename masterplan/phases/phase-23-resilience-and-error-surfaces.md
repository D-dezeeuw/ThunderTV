# Phase 23 — Resilience & Error Surfaces

> **Epic goal:** Failure becomes a designed state: every error is classified into one taxonomy, explained in plain words with working actions, and recoverable — dead streams, offline sessions, storage demotion, broken imports — with a credential-redacting diagnostics layer underneath instead of scattered console noise.
> **Verification:** On built `dist/` against the mock provider: killing the network mid-import rolls back staged rows leaving the previous generation browsable; a revoked stream walks transparent retry → fallback notice → dead-stream surface with the ordered per-engine detail; a quota-full write demotes with the single one-line notice and the small valuable set snapshotted; `dumpDiagnostics()` passes the credential-denylist test against real-shaped Xtream URLs and connect fragments; source health dots reflect refresh/playback outcomes with the offline exemption honored; every row of `docs/chaos-checklist.md` is executed with recorded results; `npm test` (taxonomy, boundary, ring-buffer, and chaos-automation suites), `npm run build`, `npx tsc --noEmit`, and ESLint are green.
> **Status:** `partial` · tracker: `not-maintained` — Classified errors (`core/http/classified-fetch.ts`), the Xtream taxonomy, `engine-report.ts`, the storage demotion notice, retry and retry-via-proxy import actions, and the redacting debug panel (`state/debug.ts`, `core/raw-capture.ts`) all ship. **Not built:** a real global error boundary (23.7) — `debug.ts` registers an `unhandledrejection` listener and nothing more — and the chaos test checklist (23.10).

Before this phase, the ingredients exist in pieces: `classifiedFetch` (§5.2), the Phase 19 Xtream error taxonomy, Phase 16.10's EPG error union, the Phase 11 engine fallback chain, Phase 07.9's staged imports, and redaction seams stubbed where phases needed them. After it, one `AppError` taxonomy and one `ErrorSurface` component present every failure where it happened; dead streams walk retry → engine fallback → mark-bad; offline is detected with corroboration and cached data keeps working; storage demotion is a one-line notice, never a white screen; every ingestion path rolls back atomically; a window-level boundary catches the truly unexpected after flushing pending persistence; every log line flows through a capped, credential-redacting ring buffer; sources wear derived health dots; and a chaos checklist proves all of it on the built app.

## Feature 23.1 — Error taxonomy and presentation patterns

One converging `AppError` type and one `ErrorSurface` component replace the per-phase error unions — cause, plain-words explanation, and declarative actions, rendered inline where the failure happened.

- [ ] **23.1.1** AppError union — define `src/core/errors.ts` with kinds `cors-or-network | http | timeout | offline | mixed-content | parse | auth | storage-quota | playback-media | playback-engine | empty | unknown`, plus context (`area`, `sourceId?`) and a `retryable` flag.
- [ ] **23.1.2** Converge existing unions — map `classifiedFetch` results, the Phase 19 Xtream taxonomy, and the Phase 16.10 EPG kinds into `AppError` via one `toAppError()` adapter; the old unions stay as inputs, never as UI-facing types.
- [ ] **23.1.3** ErrorSurface component — build `src/ui/error-surface.ts` plus its partial rendering a cause line, plain-words explanation, and an actions row — mounted inline where the failure happened (import card, list, dock), toggled by `data-if`.
- [ ] **23.1.4** Explanations per kind — key every explanation in the strings module, including the honest CORS text with its two working alternatives (download-and-upload, proxy) carried over from Phase 07.4.
- [ ] **23.1.5** Declarative actions — the surface takes `{labelKey, run}` pairs; the first action holds focus, Enter activates, ←/→ move between actions — remote-friendly by default.
- [ ] **23.1.6** Redacted detail — every `AppError` carries a pre-redacted detail string (status, host without userinfo, engine name) safe for both on-demand display and the 23.8 buffer.
- [ ] **23.1.7** Dedup window — an identical error signature within 5 s updates the existing surface (attempt counter) instead of stacking a second one.
- [ ] **23.1.8** Severity scoping — playback errors occupy only the dock/theater region and never block the list; import errors stay inside the import surface — the app around an error keeps working.
- [ ] **23.1.9** Migration sweep — replace the bespoke error markup from Phases 07 and 10–12 with `ErrorSurface` instances, deleting the duplicated templates.
- [ ] **23.1.10** Mapping tests — table-test `toAppError()` (fetch classes, 401/403 → auth, 404, 5xx, timeout, worker parse errors) asserting kind, retryable flag, and message key.

## Feature 23.2 — Dead-stream retry flow

A stream that dies gets three honest options — retry, try another engine, mark the channel bad — with attempt accounting, so users stop guessing whether it's them or the provider.

- [ ] **23.2.1** Terminal-error normalization — funnel engine terminal failures (hls.js fatal after its Phase 11 recovery attempts, mpegts.js errors, `<video>` element `error`) into `AppError` playback kinds via the player host.
- [ ] **23.2.2** One transparent retry — attempt a single automatic same-engine retry through `playChannel()` before surfacing anything, logged to diagnostics with the attempt count.
- [ ] **23.2.3** Dead-stream surface — after the transparent retry fails, show the dock `ErrorSurface` with Retry / Try another engine / Mark channel bad — focus defaults to Retry.
- [ ] **23.2.4** Manual engine advance — "Try another engine" steps the Phase 11 chain manually, honoring the Phase 22 engine order and skipping engines already failed for this URL.
- [ ] **23.2.5** Mark-bad set — "Mark channel bad" stamps the channel into a per-source `badChannels` set; rows render a subtle marker with a strings-keyed tooltip, channels stay playable, and unmarking is available from the same row.
- [ ] **23.2.6** Zap cancels — zapping away tears down the surface and cancels any pending retry so a stale retry never fires against the previous channel's URL (§5.3 discipline).
- [ ] **23.2.7** Marks persist small — persist `badChannels` as small valuable data surviving the partial tier; the set also feeds the 23.9 health tally.
- [ ] **23.2.8** VOD wording split — VOD/episode failures reuse the same flow with title-based wording and a "Back to detail" action replacing zap-related hints.
- [ ] **23.2.9** Attempt ceiling — cap the surface's loop (three manual retries, then the explanation line suggests the next engine or mark-bad) so the flow always converges.
- [ ] **23.2.10** Retry-flow tests — with mocked engines, drive fatal error → transparent retry → surface → manual fallback and assert the action sequence, cancellation on zap, and mark-bad persistence.

## Feature 23.3 — Engine fallback prompt

The Phase 11 auto-fallback stops being silent: every automatic engine switch announces what happened in one line, and an exhausted chain hands a full per-engine account to the dead-stream surface.

- [ ] **23.3.1** Fallback events — instrument the Phase 11 chain to emit `{fromEngine, toEngine, appError}` events instead of switching silently; the host forwards them to state and diagnostics.
- [ ] **23.3.2** One-line notice — render "hls.js failed (network) — switched to mpegts.js" via the notice slot over the dock, built with the strings `fmt` helper from engine and kind parameters.
- [ ] **23.3.3** Auto-dismiss on stability — clear the notice after playback holds a `playing` state for 10 s, or immediately on Esc — never a permanent nag for a recovered stream.
- [ ] **23.3.4** What-happened detail — a details toggle (`data-if`) expands the per-engine failure list (engine, `AppError` kind, elapsed ms) — plain words by default, technical detail on demand.
- [ ] **23.3.5** Chain exhaustion — when every compatible engine fails, escalate to the 23.2 surface carrying the ordered failure list as its detail block.
- [ ] **23.3.6** Preference transparency — when the Phase 22 order skipped a user-preferred engine as URL-incompatible, say so in the detail list rather than leaving the order seemingly ignored.
- [ ] **23.3.7** Last-working memo — remember the session's last working engine per channel and try it first on re-zap, skipping a known-bad first hop; the memo is session-only.
- [ ] **23.3.8** Manual switches stay quiet — suppress the notice when the switch came from the user's own "Try another engine" action; only automatic switches announce.
- [ ] **23.3.9** Diagnostics feed — log every fallback event through the 23.8 buffer and count it into the 23.9 source health tally.
- [ ] **23.3.10** Fallback tests — assert exhaustion produces the ordered detail, the stability timer clears the notice, and the memo short-circuits on re-zap.

## Feature 23.4 — Offline detection and recovery

`navigator.onLine` is a hint, not a truth — offline is declared only with corroboration, announced once, and treated as a mode where cached data keeps working and refreshes queue quietly instead of erroring one by one.

- [ ] **23.4.1** Net-status module — create `src/core/net-status.ts` publishing `net.online` from `navigator.onLine` plus the `online`/`offline` events — documented explicitly as a hint requiring corroboration.
- [ ] **23.4.2** Corroboration rules — reclassify `cors-or-network` failures as `offline` while `onLine` is false; while `onLine` claims true, two network-shaped failures to distinct origins within 30 s flip an effective-offline flag.
- [ ] **23.4.3** Offline banner — one persistent line above the list ("offline — cached data works; refresh and playback need a connection") rendered through the notice slot, never stacking.
- [ ] **23.4.4** Quiet refresh queue — playlist, EPG, and Xtream TTL refreshes short-circuit to a queued state while offline instead of surfacing individual classified errors.
- [ ] **23.4.5** Reconnect drain — on `online` plus one successful probe fetch, clear the banner and run only the most recent user-initiated queued action — no thundering herd of every source refreshing at once.
- [ ] **23.4.6** Playback honesty — a play attempt while offline surfaces the offline explanation immediately, never a spinner running into an engine timeout.
- [ ] **23.4.7** Local reads unaffected — cached full-tier reads (channels, EPG range queries, VOD catalogs) never consult net status — parse-once data serves offline by design.
- [ ] **23.4.8** Single truth — expose the same `net.online` value to Phase 24's offline boot path so PWA and in-session behavior can never disagree about connectivity.
- [ ] **23.4.9** Transition logging — log online↔offline transitions with their corroboration reason to diagnostics; the probe target is a credential-free static asset.
- [ ] **23.4.10** State-machine tests — table-test the corroboration transitions (flag × failure sequences × reconnect probe) and the queue-drain behavior.

## Feature 23.5 — Storage demotion notice and recovery

Runtime storage failure is survivable by design (§5.7): the session demotes, one calm line explains it, the small valuable data is snapshotted immediately, and the next boot re-probes for the higher tier.

- [ ] **23.5.1** Typed demotion events — emit `{fromTier, toTier, cause}` from the storage guards (`guardedSet` quota, runtime IDB open/write failure) instead of ad-hoc booleans.
- [ ] **23.5.2** One-line notice — surface exactly one notice ("storage limited on this device — playlists reload on start") reusing the plan §5 wording; repeated causes update it, never stack.
- [ ] **23.5.3** Session-scoped demotion — persist nothing about the demotion itself; the Phase 04 boot probe re-runs next start and may restore the higher tier (contract restated in a test).
- [ ] **23.5.4** Mid-write handling — an in-flight chunked bulk write aborts cleanly on demotion while the memory copy stays authoritative — the session keeps every feature, per §5's tier philosophy.
- [ ] **23.5.5** Valuable-set snapshot — immediately after demotion to partial, snapshot settings, source definitions, favorites, recent, resume positions, and `badChannels` so the small data survives even though bulk data will not.
- [ ] **23.5.6** About linkage — the notice links to Settings → About, where the 22.9.2 tier line gains the demotion cause and its consequences in plain words.
- [ ] **23.5.7** None-tier import warning — a session demoted to `none` warns before starting a large import ("this import will not survive a reload") with a confirm step.
- [ ] **23.5.8** Diagnostic detail — demotion entries carry cause and byte estimates, never key names or values.
- [ ] **23.5.9** Demotion tests — a quota-throwing localStorage stub demotes and triggers the valuable-set snapshot; an IDB write failure mid-chunk preserves memory rows and sets the notice value.
- [ ] **23.5.10** Re-probe verification — simulate reload after demotion in the storage matrix and assert the probe restores the full tier once the fault is gone.

## Feature 23.6 — Import failure recovery

Phase 07.9 made M3U imports commit-last and stageable — this feature promotes that guarantee to every ingestion path (EPG, Xtream catalogs) and every failure mode: rolled back or resumable, never half-visible.

- [ ] **23.6.1** Generalized staging — extract the staging-id / commit-last pattern from Phase 07.9 into a shared `src/core/storage/staged-write.ts` helper used by M3U, EPG, and Xtream catalog ingestion alike.
- [ ] **23.6.2** Atomic visibility — readers only ever see committed generations: the active source flips atomically on commit and the previous generation stays browsable during a re-import (extending 07.7.4's write-then-swap).
- [ ] **23.6.3** Rollback on failure — a worker error or dropped connection mid-import deletes staged rows and surfaces an `ErrorSurface` with Retry preserving the original input (URL, pasted text, or in-memory file content).
- [ ] **23.6.4** Cancel equals failure path — the progress UI's cancel action runs the identical rollback path as a failure, asserted by one shared test.
- [ ] **23.6.5** EPG protection — a failed EPG refresh leaves the previous program index intact; pruning runs only after a successful commit (tightening 16.7's contract under the shared helper).
- [ ] **23.6.6** Per-category granularity — an Xtream `get_vod_streams` failure marks only that category failed with an inline retry chip, leaving the rest of the source usable.
- [ ] **23.6.7** Partial-tier degradation — on the partial tier, staging degrades to dropping staged memory arrays (bulk was never durable); assert the same API works across all tiers.
- [ ] **23.6.8** Boot-sweep reuse — extend the Phase 07.9.7 orphan sweep to cover staged EPG and Xtream rows so a crash mid-import never leaks storage.
- [ ] **23.6.9** Lifecycle logging — log import lifecycle transitions (started / chunks / committed / rolled-back, with counts) to diagnostics — counts only, no row payloads.
- [ ] **23.6.10** Kill tests — kill the worker mid-parse and drop the network mid-fetch in integration tests, asserting staged data vanished, the old generation is intact, and an immediate retry succeeds.

## Feature 23.7 — Global error boundary

The truly unexpected gets a last resort: window-level handlers that flush pending persistence first, render a dependency-free surface, and guard against crash loops — so a bug costs a reload, never the user's data.

- [ ] **23.7.1** Handler installation — register `window.onerror` and `unhandledrejection` handlers first in the `main.ts` boot order, routing into `src/app/error-boundary.ts`.
- [ ] **23.7.2** Flush before anything — the boundary's first act is flushing the pending debounced persistence batch (bypassing the 500 ms timer) so settings, resume positions, and favorites reach storage.
- [ ] **23.7.3** Dependency-free surface — render the last-resort surface with plain static DOM (no Spektrum bindings — state may be the casualty): what happened, Reload app, Copy diagnostics.
- [ ] **23.7.4** Loop guard — more than three boundary hits in 60 s stops re-rendering the app and leaves only the static surface, preventing an error→render→error crash loop.
- [ ] **23.7.5** Redacted display — pass every message through the 23.8 redaction pass before display or copy; per §7, exception text must never expose credentials.
- [ ] **23.7.6** Player cleanup — attempt `current?.destroy()` in the boundary so a crashed UI never leaves audio playing behind the surface.
- [ ] **23.7.7** Diagnostics dump — Copy diagnostics emits the ring-buffer dump with the version/tier header — the same output as About, same denylist guarantees.
- [ ] **23.7.8** Escalation filter — errors already representable as `AppError` route to their normal inline surfaces; the boundary handles only what nothing else claimed (kind `unknown`).
- [ ] **23.7.9** Bounded reload — Reload waits for the flush with a 1 s cap, then `location.reload()` — a hung storage write cannot hold the user hostage.
- [ ] **23.7.10** Boundary tests — a synthetic `unhandledrejection` asserts flush-then-surface ordering; repeated synthetic errors assert the loop guard engages.

## Feature 23.8 — Redacting diagnostics ring buffer

The redaction seams stubbed since Phase 07 get their real implementation — a capped in-memory ring where credentials are scrubbed at write time, the idea ported from thunder-tv's `shared/logging`: a log that can always be copy-pasted safely.

- [ ] **23.8.1** Ring implementation — create `src/core/diagnostics.ts`: a fixed 300-entry ring of `{ts, level, area, message, detail?}` — in-memory only, never persisted, overwriting oldest.
- [ ] **23.8.2** Write-time redaction — scrub before storing, never at read time: `username=`/`password=` pairs, `/live|movie|series/{user}/{pass}/` path segments, URL userinfo, and `#/connect` fragments all become `***`.
- [ ] **23.8.3** Single API — expose `log(area, message, detail?)` and `dumpDiagnostics()`, completing the redacting-logger seam stubbed in Phases 07.4.9 and 16.10.8 with a real sink.
- [ ] **23.8.4** Area vocabulary — fix the area set (`http | storage | player | xtream | epg | import | net | sw | app`) so dumps can be scanned by subsystem.
- [ ] **23.8.5** Detail bounds — stringify `detail` with a ~1 KB cap and no object references, so the ring can never pin bulk arrays in memory (§5.8's spirit applied to logs).
- [ ] **23.8.6** Console fence — add `no-console` to ESLint for all of `src/` except `core/diagnostics.ts`; a dev-mode mirror echoes entries to the console, production stays silent.
- [ ] **23.8.7** Dump header — prefix dumps with version, storage tier, and user agent — shared verbatim by About's copy action and the error boundary.
- [ ] **23.8.8** Module adoption — migrate existing call sites (http classifications, fallback events, demotion events, import lifecycle) onto `log()`, deleting scattered `console.*` lines.
- [ ] **23.8.9** Overflow accounting — dropping entries on overflow increments a counter surfaced as one synthetic marker entry, so a flooded ring is detectable in the dump.
- [ ] **23.8.10** Redaction corpus tests — run real-shaped Xtream URLs, connect fragments, proxy templates with embedded keys, and JSON-stringified details through the writer, asserting `***` output and a clean pass of the credential-denylist helper.

## Feature 23.9 — Source health indicators

Sources wear their condition on their sleeve: a derived status dot per source in the sources view, fed by refresh and playback outcomes — honest, session-fresh, and never blaming a source for the network being down.

- [ ] **23.9.1** Derived health field — add per-source health (`unknown | ok | degraded | failing | auth`) to the sources model, computed from outcomes — never user-set, never persisted as a verdict.
- [ ] **23.9.2** Refresh outcomes — a successful refresh or `304` sets `ok`; classified refresh failures set `failing` with the `AppError` kind retained for the status line.
- [ ] **23.9.3** Playback outcomes — count session stream failures per source; failures on three distinct channels set `degraded` — one bad channel never taints the source.
- [ ] **23.9.4** Auth special case — 401/403 outcomes set the `auth` status with a "check credentials" line linking to editing the source.
- [ ] **23.9.5** Offline exemption — outcomes classified offline (Feature 23.4) never touch health — offline is global, not the source's fault.
- [ ] **23.9.6** Dots in the sources view — render status dots with token colors plus a plain-words status line on the source row; color is never the only signal (a label accompanies it).
- [ ] **23.9.7** Rail badge — show a minimal dot on the rail's Sources icon when any source is `failing`/`auth` — information on demand, no counts, no animation.
- [ ] **23.9.8** Boot reset — health resets to `unknown` each boot (session-derived) while `lastRefresh`/`lastError` metadata stays persisted from earlier phases.
- [ ] **23.9.9** Health logging — status transitions log their triggering outcome to diagnostics; all labels come from the strings module.
- [ ] **23.9.10** Transition tests — table-test outcome→status transitions including the offline exemption, the distinct-channel threshold, and the auth path.

## Feature 23.10 — Chaos test checklist

Resilience claims get executed, not asserted: a documented chaos checklist — kill the network mid-import, fill storage mid-write, revoke a stream mid-play — with expected behaviors, automated where practical, run on built `dist/` before merge.

- [ ] **23.10.1** Checklist document — create `docs/chaos-checklist.md`: one row per scenario with setup steps (DevTools offline, quota simulation, mock-server kill), the expected observable behavior, and a result column per run.
- [ ] **23.10.2** Network-kill import — scenario: drop the network mid-URL-import → staged rollback (Feature 23.6), previous generation browsable, Retry succeeds after reconnect.
- [ ] **23.10.3** Quota mid-write — scenario: fill localStorage on the partial tier mid-snapshot → §5.7 demotion, one-line notice, session fully functional, valuable set preserved where possible.
- [ ] **23.10.4** Stream revocation — scenario: the mock server 404s segments mid-play → hls.js recovery → fallback notice → dead-stream surface with the ordered engine detail.
- [ ] **23.10.5** HTML-not-JSON — scenario: the provider answers `player_api.php` with an HTML login page → parse-kind `AppError`, source health `failing`, no uncaught exception.
- [ ] **23.10.6** IDB failure mid-chunk — scenario: force an IDB write error during a bulk import chunk → demotion path, memory retains the import, non-persistence warning shown.
- [ ] **23.10.7** Injected crash — scenario: throw during a zap → boundary flush and static surface; after reload, resume positions and favorites are intact.
- [ ] **23.10.8** Automation split — automate the automatable rows (network-kill import, quota demotion, HTML-not-JSON) in Vitest/Playwright and mark every checklist row automated or manual.
- [ ] **23.10.9** Full run on dist — execute every row against the built `dist/` with the mock provider, recording results and deviations in the checklist file itself.
- [ ] **23.10.10** Phase bookkeeping — check every box, record the decisions (transparent-retry-first, session-scoped health, staging generalization), and run the standing verification checklist from MASTERPLAN.md §3.
