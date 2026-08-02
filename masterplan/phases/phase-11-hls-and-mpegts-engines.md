# Phase 11 — HLS & MPEG-TS Engines

> **Epic goal:** Turn the Phase 10 playback foundation into production-quality streaming: hardened hls.js and mpegts.js engines with real error recovery, a native-Safari path, and an automatic fallback chain that either plays the stream or explains in plain words why it cannot.
> **Verification:** On the built `dist/`, an HLS live channel, an HLS VOD item, a raw `.ts` stream, and a radio stream all play in Chromium and Firefox, and the native path passes in Safari; killing the network mid-play triggers backoff retries and `recoverMediaError` handling without a page reload; a dead URL walks the fallback chain and ends in a classified plain-words failure (never an uncaught rejection); zapping 50 channels shows no MediaSource or listener growth in a heap snapshot; the 11.10 engine matrix is executed and its results table filled in.
> **Status:** `shipped` · tracker: `not-maintained` — hls.js, mpegts.js and native all sit behind one interface with `attemptChain()` ordering preference-then-fallbacks, plus the `isProgressiveFile()` exception that keeps a movie away from both demuxers. Audio-only streams route through `src/channels/radio-detect.ts` and the Radio view; `engine-report.ts` turns a failure into a sentence.

Before this phase, Phase 10 provides the player host (`src/player/engine-host.ts`), the `PlayerEngine` interface, URL-based engine selection with lazy `import()` (masterplan §6.5), and the destroy-before-create teardown discipline (§5.3) — but only naive happy-path playback. After this phase, `src/player/engines/` contains battle-ready hls.js, mpegts.js, and native implementations with recovery strategies, live-edge handling, audio-only presentation, buffers tuned for low-end devices, and an automatic fallback chain whose classified give-up state feeds the Phase 12 dock indicators and the Phase 23 retry flows.

## Feature 11.1 — hls.js engine wrapper (config, attach/detach, level events)

A disciplined hls.js implementation of the `PlayerEngine` interface: lazily chunked, config-driven, and guaranteed to clean up every listener it registers. This is the workhorse engine for the majority of IPTV sources.

- [ ] **11.1.1** Create `src/player/engines/hls.ts` — implement the Phase 10 `PlayerEngine` interface (`attach`, `destroy`, status callbacks) as an hls.js wrapper, kept ≤300 lines by delegating recovery to 11.2.
- [ ] **11.1.2** Keep `import('hls.js')` inside the engine module — confirm the Vite `manualChunks` config emits hls.js as its own chunk so the browse UI still ships zero player bytes.
- [ ] **11.1.3** Guard construction with `Hls.isSupported()` — throw a typed `EngineUnsupportedError` the 11.5 fallback chain can catch instead of crashing the host.
- [ ] **11.1.4** Add `src/player/engines/hls-config.ts` — a single factory returning the shared `HlsConfig` object (`enableWorker: true`, `capLevelToPlayerSize: true`) so 11.9 tuning has exactly one home.
- [ ] **11.1.5** Implement `attach(video, url)` — `new Hls(config)`, `attachMedia`, `loadSource`, resolving only after `Hls.Events.MANIFEST_PARSED` fires or a fatal error rejects the attach promise.
- [ ] **11.1.6** Register named handlers for `Hls.Events.MANIFEST_PARSED`, `LEVEL_SWITCHED`, and `ERROR` — store the references so `destroy()` can `off()` every one of them deterministically.
- [ ] **11.1.7** Publish compact level info via `setValue('player.levels', …)` and `setValue('player.activeLevel', …)` — resolution/bitrate summaries only, never raw hls.js objects into Spektrum state.
- [ ] **11.1.8** Implement `destroy()` — `hls.destroy()` plus listener detach, leaving the `<video>` reset (`removeAttribute('src')` + `load()`) to the engine-host contract without double-resetting.
- [ ] **11.1.9** Wire the `.m3u8` branch of `src/player/select-engine.ts` to return `HlsEngine` whenever the 11.3 native gate declines.
- [ ] **11.1.10** Unit-test with a mocked `hls.js` module — attach resolves on MANIFEST_PARSED, destroy removes every registered listener, and a second attach after destroy starts from a clean instance.

## Feature 11.2 — hls.js error recovery strategy (network retry with backoff, recoverMediaError, fatal → engine-failed signal)

IPTV streams stall, drop, and glitch constantly; a player that reloads the page on the first fatal error is unusable. This feature encodes the canonical hls.js recovery ladder as a small, testable strategy module.

- [ ] **11.2.1** Centralize `Hls.Events.ERROR` handling in `src/player/engines/hls-recovery.ts` — a strategy module the engine delegates to, keeping `hls.ts` within the line budget.
- [ ] **11.2.2** Non-fatal errors: count per `Hls.ErrorTypes` bucket into the 11.8 diagnostics recorder and take no action — hls.js already retries fragments internally.
- [ ] **11.2.3** Fatal `Hls.ErrorTypes.NETWORK_ERROR`: call `hls.startLoad()` with exponential backoff (1 s → 2 s → 4 s, max 3 attempts) via a single tracked timer that `destroy()` cancels.
- [ ] **11.2.4** Fatal `Hls.ErrorTypes.MEDIA_ERROR`: call `hls.recoverMediaError()` at most twice, invoking `hls.swapAudioCodec()` before the second attempt per hls.js guidance.
- [ ] **11.2.5** Any other fatal type, or an exhausted retry budget: emit the host's `engine-failed` signal carrying `{ errorType, details }` and stop touching the media element.
- [ ] **11.2.6** Reset backoff counters once playback genuinely resumes (`FRAG_BUFFERED` after recovery) so a later hiccup gets a fresh retry budget instead of an instant give-up.
- [ ] **11.2.7** Publish `setValue('player.status', 'recovering')` while a retry timer is pending so the Phase 12 dock can render a text state for it.
- [ ] **11.2.8** Route every recovery log line through the diagnostics recorder with the stream URL redacted — Xtream-style URLs embed credentials (masterplan §6.8), so raw URLs never reach `console.*`.
- [ ] **11.2.9** Unit-test the strategy with scripted error sequences — network-fatal ×3 ends in engine-failed; media-fatal invokes `recoverMediaError` with `swapAudioCodec` before the second attempt.
- [ ] **11.2.10** Manually verify on `dist/`: kill the network mid-stream and restore within the backoff window — playback resumes without reload; keep it dead and confirm engine-failed after the third attempt.

## Feature 11.3 — Native HLS path for Safari (canPlayType gate, same PlayerEngine interface)

Safari plays HLS natively and does not need (or reliably tolerate) MSE-based hls.js. The native path must be a capability-gated, interface-identical peer — the host never learns which engine family is running.

- [ ] **11.3.1** Implement `nativeHlsSupported()` in `src/player/select-engine.ts` — gate on `video.canPlayType('application/vnd.apple.mpegurl') !== ''`, never on user-agent sniffing.
- [ ] **11.3.2** Extend the Phase 10 `NativeEngine` (`src/player/engines/native.ts`) so `.m3u8`-on-Safari sets `video.src` directly while satisfying the same `PlayerEngine` interface — no special-case branches in the host.
- [ ] **11.3.3** Map native `error` events (`video.error.code`: `MEDIA_ERR_SRC_NOT_SUPPORTED`, `MEDIA_ERR_DECODE`, …) onto the same `engine-failed` payload shape the hls.js engine emits.
- [ ] **11.3.4** Resolve `attach()` on `loadedmetadata` so the host's ready semantics match the MANIFEST_PARSED behavior of the hls.js path.
- [ ] **11.3.5** Detect live vs VOD on the native path via `video.duration === Infinity` and publish the same `player.isLive` value 11.6 defines.
- [ ] **11.3.6** Ensure `destroy()` removes every native listener and defers media-pipeline release to the host's `removeAttribute('src')` + `load()` sequence.
- [ ] **11.3.7** Report "no levels" gracefully — `player.levels` stays an empty array on the native path so Phase 12 UI needs no engine-specific branches.
- [ ] **11.3.8** Keep the preference order explicit: native gate first for `.m3u8`, hls.js otherwise — and allow the 11.5 chain to still try hls.js after a native failure on browsers supporting both.
- [ ] **11.3.9** Unit-test the gate with stubbed `canPlayType` returns (`''`, `'maybe'`, `'probably'`) — hls.js chosen for the empty string, native for the other two.
- [ ] **11.3.10** Manual Safari check (macOS or iOS) recorded in the 11.10 matrix — an HLS live and a VOD stream play through the native path on the built `dist/`.

## Feature 11.4 — mpegts.js engine wrapper for raw .ts streams

Raw MPEG-TS over HTTP is the second-most-common IPTV stream shape and cannot play through hls.js or native `<video>`. mpegts.js gets the same disciplined wrapper treatment, including its notoriously order-sensitive teardown.

- [ ] **11.4.1** Create `src/player/engines/mpegts.ts` implementing `PlayerEngine` over mpegts.js, with `import('mpegts.js')` kept inside the module so Vite emits it as its own lazy chunk.
- [ ] **11.4.2** Gate on `mpegts.getFeatureList().mseLivePlayback` — throw the shared `EngineUnsupportedError` when MSE live playback is unavailable so the 11.5 chain can advance.
- [ ] **11.4.3** `attach()`: `mpegts.createPlayer({ type: 'mpegts', isLive: true, url })`, `attachMediaElement(video)`, `load()`, then `play()` — resolve on the first `mpegts.Events.MEDIA_INFO`.
- [ ] **11.4.4** Subscribe to `mpegts.Events.ERROR` — map its NetworkError/MediaError types onto the exact engine-failed payload shape the hls.js engine uses, so the chain sees one vocabulary.
- [ ] **11.4.5** `destroy()`: `pause()` → `unload()` → `detachMediaElement()` → `player.destroy()` in that exact order — mpegts.js leaks its loader and XHRs otherwise.
- [ ] **11.4.6** Forward `MEDIA_INFO` codec strings into the 11.8 diagnostics recorder — mpegts.js names the actual audio/video codecs, which is the key evidence for codec failures.
- [ ] **11.4.7** Add `src/player/engines/mpegts-config.ts` mirroring the hls-config factory pattern so 11.9 tunes both engines through the same ledger approach.
- [ ] **11.4.8** Wire the `.ts` branch of `src/player/select-engine.ts` to return `MpegtsEngine` as the first candidate.
- [ ] **11.4.9** Unit-test destroy ordering with a mocked mpegts module — assert the pause/unload/detach/destroy sequence and that a rejected attach still leaves no live player reference.
- [ ] **11.4.10** Manual check on `dist/` with a real raw `.ts` live stream — playback starts, zapping away tears down cleanly (no lingering network activity in devtools).

## Feature 11.5 — Automatic engine fallback chain (failed engine → next candidate → classified give-up)

Extensions lie, containers mislabel, and providers serve `.ts` from `.m3u8` URLs. When an engine fails, the host silently tries the next sensible candidate, and only after exhausting the chain does the user see a single classified explanation.

- [ ] **11.5.1** Add `src/player/fallback-chain.ts` — a pure `candidatesFor(url): EngineKind[]` (`.m3u8` → [native-if-gated, hls], `.ts` → [mpegts, native], unknown → [native, hls, mpegts]).
- [ ] **11.5.2** Teach `src/player/engine-host.ts` to consume the engine-failed signal: destroy the current engine, advance to the next candidate, re-attach — full §5.3 destroy-before-create discipline between attempts.
- [ ] **11.5.3** Try each candidate at most once per play request, and stamp attempts with a generation counter so a late failure signal from an already-destroyed engine cannot resurrect a dead chain mid-zap.
- [ ] **11.5.4** Run `mixedContentBlocked()` (masterplan §5.9) before the first attempt — an `http://` stream on the `https://` origin skips the chain entirely and reports the mixed-content classification with the desktop-app note.
- [ ] **11.5.5** Classify the give-up by aggregating per-engine failure payloads into one token (`mixed-content` | `cors-or-network` | `http-error` | `codec-unsupported` | `timeout`) for 11.8 to translate.
- [ ] **11.5.6** Publish `setValue('player.status', 'failed')` and `setValue('player.lastError', token)` on give-up — the Phase 12 dock and Phase 23 retry flows read these values, never engine internals.
- [ ] **11.5.7** Treat `EngineUnsupportedError` at construction as a silent chain advance — a missing capability is not a stream failure and must not pollute the classification.
- [ ] **11.5.8** Keep chain bookkeeping in module memory, out of recorded Spektrum history — only the compact final status is state, per the §5.8 rule of thumb.
- [ ] **11.5.9** Unit-test: a `.ts` URL whose mpegts attach rejects falls back to native; all candidates failing yields exactly one `status='failed'` publish carrying a classification token.
- [ ] **11.5.10** Manual `dist/` check: a dead URL and a wrong-container URL both end in the classified failure with zero uncaught promise rejections in the console.

## Feature 11.6 — Live-edge and latency handling (seek-to-live on stall, live vs VOD detection)

Live IPTV drifts behind the edge after stalls, tab switches, and laptop sleeps; VOD must never be force-seeked. One watchdog per session — no per-row or per-frame timers — keeps live streams live.

- [ ] **11.6.1** Normalize live detection per engine — hls.js `levelDetails.live` on `LEVEL_LOADED`, the mpegts `isLive` config, native `duration === Infinity` — into a single `setValue('player.isLive', bool)`.
- [ ] **11.6.2** Implement one stall watchdog in `src/player/live-edge.ts` — a single timer per active session, armed on `waiting`, cleared by `timeupdate` progress, and destroyed with the engine.
- [ ] **11.6.3** On a stall exceeding 8 s on a live stream, seek to the edge — `hls.liveSyncPosition` when available, else `video.seekable.end(last) - 3` — exactly once per stall episode.
- [ ] **11.6.4** On `visibilitychange` back to visible, re-seek live streams that fell behind the edge beyond the threshold instead of letting the buffer race hopelessly.
- [ ] **11.6.5** Keep the threshold constants (stall timeout, edge distance) beside the engine configs so the 11.9 low-end profile can widen them from one place.
- [ ] **11.6.6** Preserve VOD semantics: streams with `player.isLive === false` receive no forced seeks and retain their playback position through recovery.
- [ ] **11.6.7** Expose behind-edge distance to the 11.8 diagnostics recorder only — no new intervals, no per-tick UI state for latency numbers.
- [ ] **11.6.8** Guard every seek against an empty `seekable` range (mid-recovery) — skip and let the 11.2 recovery strategy finish first.
- [ ] **11.6.9** Unit-test the watchdog with fake timers: `waiting` with no `timeupdate` fires exactly one seek; `waiting` followed by `timeupdate` cancels cleanly.
- [ ] **11.6.10** Manual check: suspend the laptop 30 s mid-live-stream, resume — playback jumps to the live edge without reload; a paused VOD stream stays where it was.

## Feature 11.7 — Audio-only stream handling (radio flag → hide video canvas, show station layout)

Radio channels are first-class in M3U playlists (`radio="true"`). An audio-only session should hide the dead video canvas and present a minimal station layout instead of a black rectangle.

- [ ] **11.7.1** Carry the `radio` flag from the ported m3u-utils channel rows into the play request so the player knows audio-only intent before attach.
- [ ] **11.7.2** Also detect audio-only at runtime — `loadedmetadata` with `videoWidth === 0`, or an hls.js level list without video codecs — publishing `setValue('player.audioOnly', true)` either way.
- [ ] **11.7.3** Hide the video canvas for audio-only sessions (`display: none`, instant — no transition) and show the station layout: logo in a fixed-size box, station name, group.
- [ ] **11.7.4** Keep engine selection untouched by the flag — radio changes presentation only, mirroring the thunder-tv precedent of radio always playing inline.
- [ ] **11.7.5** Drive audio-only volume and mute from the same persisted `player.volume`/`player.muted` keys Phase 12.4 defines — zero radio-specific audio state.
- [ ] **11.7.6** Build the station layout as a template partial in `src/ui/` bound with `data-if="player.audioOnly"` — declarative Spektrum bindings, no JS-driven DOM assembly.
- [ ] **11.7.7** Fall back to a neutral glyph in the same fixed box when the station logo is missing or fails to load — zero layout shift between radio channels.
- [ ] **11.7.8** Suppress EPG affordances for radio sessions now, and document that Phase 17 must keep them suppressed — radio streams carry no EPG data.
- [ ] **11.7.9** Unit-test both detection paths (flag-set and videoWidth-0) end with `player.audioOnly === true`, and that a subsequent normal channel resets it to false.
- [ ] **11.7.10** Manual `dist/` check: an internet-radio stream plays with the station layout; zapping radio → TV → radio toggles the canvas correctly each time.

## Feature 11.8 — Codec/container diagnostics surface (expose why a stream failed in plain words)

"MEDIA_ERR_DECODE" helps nobody. Every give-up token maps to a plain-words explanation with the working alternative, backed by a bounded diagnostics recorder that never stores a credential.

- [ ] **11.8.1** Create `src/player/diagnostics.ts` — a bounded ring buffer (~50 entries) of engine attempts, error events, and codec info; module memory, never Spektrum bulk state.
- [ ] **11.8.2** Map every 11.5 give-up token to a plain-words explanation in the central strings module — "This stream uses a format this browser cannot decode", never a raw error constant.
- [ ] **11.8.3** Include the working alternative in each message where one exists — the proxy setting for `cors-or-network`, the desktop app for `mixed-content`, "try another channel" for codec failures.
- [ ] **11.8.4** Record which engines were tried and each one's failure type, surfaced as a compact "what we tried" list inside the failure detail.
- [ ] **11.8.5** Fold the mpegts `MEDIA_INFO` codec strings and hls.js level codec attributes into the record so codec failures name the actual offending codec.
- [ ] **11.8.6** Redact at the recorder boundary — one `redactUrl()` helper strips Xtream user/pass path segments and query tokens before any string is stored, thrown, or logged.
- [ ] **11.8.7** Expose the detail behind a "Show details" disclosure on the failure state (rendered by the Phase 12 dock) — collapsed by default, information on demand.
- [ ] **11.8.8** Add a `computed()` over `player.lastError` resolving the strings-module key so the failure template stays logic-free.
- [ ] **11.8.9** Unit-test redaction: a `/live/user/pass/1.m3u8` URL never appears un-redacted in recorder output or in any thrown error message.
- [ ] **11.8.10** Unit-test the classification→message mapping: every token resolves to a non-empty, mutually distinct string.

## Feature 11.9 — Buffer and level tuning for low-end devices (conservative defaults, capped back-buffer)

Default hls.js/mpegts.js buffering assumes desktop headroom; TV webviews and old laptops do not have it. Conservative, documented defaults plus a low-end profile keep long sessions and zap sprees memory-flat.

- [ ] **11.9.1** Set conservative hls.js defaults in `hls-config.ts`: `backBufferLength: 30`, `maxBufferLength: 30`, a capped `maxBufferSize` (~60 MB), `capLevelToPlayerSize: true`.
- [ ] **11.9.2** Start at modest quality — `startLevel: -1` with a lowered `abrEwmaDefaultEstimate` so first frames arrive fast on weak connections and ABR climbs from there.
- [ ] **11.9.3** Keep `enableWorker: true` and verify the hls.js worker functions under the Vite build's worker format, degrading cleanly when workers are denied.
- [ ] **11.9.4** Tune mpegts in `mpegts-config.ts`: enable `lazyLoad` with a bounded `lazyLoadMaxDuration` and cap `stashInitialSize` — no unbounded stash growth on 90-minute sessions.
- [ ] **11.9.5** Add a `lowEnd` profile (shorter back-buffer, wider 11.6 live-edge thresholds, `capLevelOnFPSDrop: true`) selected via a `capabilities`-driven heuristic — groundwork for the webOS target.
- [ ] **11.9.6** Document every non-default value with a one-line "why" comment — the config files are the tuning ledger, reviewed as such.
- [ ] **11.9.7** Soak-test a 30-minute live HLS session: `video.buffered` ranges stay bounded and the heap stays flat in a before/after snapshot.
- [ ] **11.9.8** Zap-soak: 50 sequential zaps across hls/mpegts/native — heap comparison shows no detached MediaSource, listener, or timer growth.
- [ ] **11.9.9** Verify post-build chunking: hls.js and mpegts.js chunks load only on first playback and the initial app JS stays within the ≤~60 KB gz budget (masterplan §3 checklist).
- [ ] **11.9.10** Unit-test that both engines consume their shared config factories — no inline config literals drifting away from the ledger.

## Feature 11.10 — Engine matrix manual test protocol (documented stream-type × engine × browser grid)

Streaming correctness cannot be fully automated against real providers. A written, repeatable matrix makes the manual verification honest, comparable across releases, and executable by anyone.

- [ ] **11.10.1** Write `docs/engine-matrix.md` in the thundertv repo — the grid: stream types (HLS live, HLS VOD, raw `.ts` live, MP4/native, radio/audio, mixed-content `http://`) × engines (hls.js, mpegts.js, native) × browsers (Chromium, Firefox, Safari).
- [ ] **11.10.2** Define the expected outcome per cell up front — plays / falls back to engine X / classified failure token — so a run is pass/fail, not vibes.
- [ ] **11.10.3** Describe required reference-stream characteristics per type in the doc, with actual URLs kept in a local untracked file — no provider URLs committed to the repo.
- [ ] **11.10.4** Include the recovery drills as numbered protocol steps: network kill/restore, suspend/resume, dead URL, wrong-container URL.
- [ ] **11.10.5** Include the 11.9 zap-soak and long-session soak as protocol steps with their explicit pass criteria.
- [ ] **11.10.6** Add a results table (date, browser version, cell outcome) and fill it in for this phase's run.
- [ ] **11.10.7** Execute the full grid on the built `dist/` (never the dev server) for Chromium and Firefox.
- [ ] **11.10.8** Execute the Safari column on real hardware and record the OS/browser versions alongside the results.
- [ ] **11.10.9** Record any deviation or accepted failure as a decision note next to the relevant task in this phase file, per the masterplan autonomy rule.
- [ ] **11.10.10** Reference the matrix from the standing pre-release checklist so Phases 26 and 30 re-run the identical protocol — keep the doc self-contained for that purpose.
