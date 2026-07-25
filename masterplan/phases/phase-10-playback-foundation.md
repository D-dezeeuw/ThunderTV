# Phase 10 — Playback Foundation

> **Epic goal:** The engine-agnostic player core — a single-owner host element, the frozen `PlayerEngine` interface, URL-based engine selection with lazy per-engine chunks, a native-video reference engine, and leak-free teardown discipline — before any specific engine matures in Phase 11.
> **Verification:** On the built `dist/`, clicking a channel plays an mp4/native-HLS fixture through the dock with correct state transitions; the browse bundle contains zero player code (chunk-graph check); the scripted 100-channel zap run per MASTERPLAN.md §5.3 shows one live engine and flat heap; an `http://` stream on the `https://` deployment shows the specific mixed-content explanation before any engine loads.

Before this phase, clicking a channel dispatches `setActiveChannel` into a stub — the app browses 90 k channels but plays none. After it, `src/player/` exists as the engine-agnostic core: the host owns the app's one `<video>` element, `selectEngine` maps URLs to lazily imported engines per §6.5, `NativeEngine` proves the interface against real streams, `state/player` tracks the session per §6.3/§6.4, and the §5.3 destroy-before-create discipline is enforced and leak-tested. hls.js and mpegts.js internals arrive in Phase 11; the sockets they plug into are finished here.

## Feature 10.1 — Player host component and lifecycle (single video element owner)

Exactly one `<video>` element exists for the app's lifetime, owned by one host module — every engine attaches to it and detaches from it, which is the precondition for the §5.3 teardown discipline being enforceable at all.

- [ ] **10.1.1** Create `src/player/host.ts` owning the single `<video>` element rendered in the player dock markup — engines receive it via `attach()`, and no other module ever queries or creates video elements.
- [ ] **10.1.2** Expose `playChannel(channel)` as the host's public API, shaped per the §5.3 engine-host sketch — destroy current, release src, select engine, attach — with the channel row (not a bare URL) so DRM and radio flags travel along.
- [ ] **10.1.3** Load the entire `src/player/` module lazily — the first `setActiveChannel` dispatch dynamically imports the player bundle, so the browse UI ships player-free per the §3 initial-JS budget; note the boundary decision.
- [ ] **10.1.4** Show the dock only when playback exists — `data-if` on the player status hides it at `idle`, per plan §9's "player dock (only when playing)".
- [ ] **10.1.5** Configure the video element for the phase — `playsinline`, native controls enabled as the interim UI until Phase 12's transport, `preload="none"`; record the native-controls interim as a decision note.
- [ ] **10.1.6** Apply persisted volume before first playback — read the volume-memory setting at host init and set it on the element, so no channel ever blasts at default volume (plan §9 Playback settings).
- [ ] **10.1.7** Serialize concurrent `playChannel` calls latest-wins — a zap during engine setup cancels the in-flight attach and proceeds with the newest channel; intermediate channels never attach.
- [ ] **10.1.8** Keep playback alive across view changes — the dock and its video persist while the user browses lists, groups, and search (the list-stays-usable promise); only an explicit stop tears down.
- [ ] **10.1.9** Keep `host.ts` ≤ 300 lines — selection lives in `select-engine.ts`, state mapping in `state/player.ts`, engines under `engines/`; the host is orchestration only.
- [ ] **10.1.10** Unit-test lifecycle ordering with a stubbed engine — `playChannel` twice asserts destroy-before-create, src release between attaches, and latest-wins under interleaved calls.

## Feature 10.2 — PlayerEngine interface (attach/play/stop/setVolume/destroy, event callbacks)

The interface is this phase's real deliverable — frozen here so Phase 11's hls.js and mpegts.js engines implement a settled contract, and so the host never contains engine-specific branches.

- [ ] **10.2.1** Define `PlayerEngine` in `src/player/engine.ts` — `attach(video, url): Promise<void>`, `play()`, `stop()`, `setVolume(v)`, `destroy()` — the complete surface the host is allowed to call.
- [ ] **10.2.2** Define the event-callback contract alongside it — `onStateChange('loading' | 'playing' | 'buffering' | 'ended')` and `onError(kind, detail)` — set by the host before `attach`, the only channel engines report through.
- [ ] **10.2.3** Define the shared error taxonomy — `network | media | unsupported | drm | mixed-content | engine-load` — in `src/player/errors.ts`, the vocabulary Phase 23's error surfaces and retry flows will consume.
- [ ] **10.2.4** Document the `destroy()` contract in JSDoc as binding — release MediaSource, abort in-flight requests, clear timers, detach all listeners — the §5.3 obligations every implementation owes.
- [ ] **10.2.5** Specify `stop()` vs `destroy()` semantics — stop pauses and detaches the media source but keeps the instance reusable; destroy ends the instance permanently; the host uses destroy on zap and stop never (until Phase 12's pause UX); documented with rationale.
- [ ] **10.2.6** Keep engines framework-free — no engine file imports Spektrum or `src/state/`; the host maps engine callbacks onto state actions, enforced by a lint fence on `src/player/engines/`.
- [ ] **10.2.7** Specify volume semantics — engines apply `setVolume` to the element (or engine API where required); persistence and mute policy remain host/state concerns, never engine concerns.
- [ ] **10.2.8** Enforce single-use `attach` — a dev-mode assertion throws on a second `attach` call to the same instance, making the create-per-playback lifecycle structural.
- [ ] **10.2.9** Add compile-time conformance checks — a type-level test file instantiates `NativeEngine` (and Phase 11 placeholders) against the interface so any drift fails `npx tsc --noEmit`.
- [ ] **10.2.10** Write interface-contract tests runnable against any implementation — a shared spec suite (attach resolves, callbacks fire in legal order, destroy is idempotent) that `NativeEngine` passes now and Phase 11 engines must pass unchanged.

## Feature 10.3 — Engine selection by URL heuristics (selectEngine per MASTERPLAN.md §6.5)

One module decides what plays a URL — `.m3u8` to HLS (native on Safari), `.ts` to mpegts, everything else to native — using the ported extension helpers that already understand IPTV's messy URL shapes.

- [ ] **10.3.1** Implement `src/player/select-engine.ts` per §6.5 — `.m3u8` → native-HLS-capable ? `NativeEngine` : lazy `HlsEngine`; `.ts` → lazy `MpegtsEngine`; otherwise `NativeEngine`.
- [ ] **10.3.2** Resolve extensions with the ported `getStreamExtensionFromUrl` from `src/m3u/` — it handles query strings, fragments, and the `?extension=` hint, improving on the plan sketch's naive `split('?')`; note the substitution.
- [ ] **10.3.3** Implement `nativeHlsSupported()` via `video.canPlayType('application/vnd.apple.mpegurl')`, probed once and cached — the Safari path that skips loading hls.js entirely.
- [ ] **10.3.4** Route extension-less URLs (e.g. `/ace/getstream?infohash=…`, per the ported helper's own doc comment) to `NativeEngine` as the documented fallback, leaving a content-sniff hook for Phase 11's fallback chain; note the deferral.
- [ ] **10.3.5** Short-circuit DRM-flagged channels before selection — `channel.drm` present means an immediate `drm`-kind error state naming the license type, engine never loaded; `supported: false` schemes get the diagnostic thunder-tv's kodiprop port was built to enable.
- [ ] **10.3.6** Return `{ engineId, load }` — an identifier plus a loader thunk — so `select-engine.ts` itself imports no engine modules and stays statically clean of engine code.
- [ ] **10.3.7** Register real loader thunks for `hls` and `mpegts` now, resolving to placeholder engines that attempt native playback and otherwise emit an `unsupported`-kind error — honest interim behavior until Phase 11 replaces the internals behind the same thunks; note the strategy.
- [ ] **10.3.8** Play radio channels through the same selection path — audio streams play fine through the video element; `channel.radio` affects UI in later phases, never engine choice; note the decision.
- [ ] **10.3.9** Unit-test selection as a URL table — `.m3u8` with and without native HLS, `.ts`, `.mp4`, query-string extensions, `?extension=` hints, extension-less proxies, and DRM short-circuits each assert the expected engine id or error.
- [ ] **10.3.10** Keep case-insensitivity and trailing-junk tolerance covered — `.M3U8`, `.m3u8?token=…`, and fragment-bearing URLs select identically, matching the ported helper's normalization.

## Feature 10.4 — Lazy dynamic import per engine (manualChunks so browse UI ships player-free)

The browse UI must never pay for players — engines arrive as their own chunks on first play, with the chunk graph checked in the build so the budget is enforced, not assumed.

- [ ] **10.4.1** Load engines exclusively through `await import('./engines/hls')` / `import('./engines/mpegts')` inside the selection thunks, per §6.5 — no static imports of engine modules anywhere outside `engines/`.
- [ ] **10.4.2** Configure `vite.config.ts` `manualChunks` to split hls.js and mpegts.js vendor code into named chunks (`engine-hls`, `engine-mpegts`), per the plan §3 repo-layout note.
- [ ] **10.4.3** Add a build-time chunk-graph check script — the entry chunk and its static imports must contain no module from `src/player/engines/` or the player vendor libs; wired into the build so the ≤ ~60 KB gz budget is a failing check, not a hope.
- [ ] **10.4.4** Skip speculative preloading in v1 — no hover-triggered engine prefetch; first-play latency pays the chunk load once per session, recorded as a decision note with the measured cost beside it.
- [ ] **10.4.5** Classify dynamic-import failures — a failed engine chunk load (offline, CDN hiccup) becomes an `engine-load`-kind error with a retry action, not an unhandled rejection.
- [ ] **10.4.6** Guard the double-zap race — a monotonic playback token invalidates any engine whose dynamic import resolves after a newer `playChannel` started; the stale engine is destroyed on arrival, never attached.
- [ ] **10.4.7** Keep engine chunk names build-stable (explicit `manualChunks` naming) so Phase 24's service worker can cache them deterministically.
- [ ] **10.4.8** Test the lazy path with mocked dynamic imports — browsing triggers zero loader calls; the first play calls exactly one loader; a second play of the same type reuses the loaded module.
- [ ] **10.4.9** Measure first-play latency added by the chunk load on the deployed Pages URL (cold cache and warm) and record both numbers as the baseline for the 10.4.4 decision.
- [ ] **10.4.10** Record the post-build size report — entry chunk, player core chunk, and per-engine chunk gzip sizes — as a table in this phase file for Phase 26 to diff against.

## Feature 10.5 — Plain native video engine (mp4/webm/unknown)

The simplest engine proves the whole architecture — direct `src` assignment, media events mapped to the callback contract, and the reference implementation every interface test runs against.

- [ ] **10.5.1** Implement `src/player/engines/native.ts` — `NativeEngine.attach` assigns `video.src = url` directly, covering mp4/webm/unknown streams and native HLS on Safari.
- [ ] **10.5.2** Fulfill the destroy contract exactly — `removeAttribute('src')` plus `video.load()` to release the resource, and removal of every media-event listener the engine added, per §5.3.
- [ ] **10.5.3** Map media events to the callback contract — `loadstart`→`loading`, `playing`→`playing`, `waiting`→`buffering`, `ended`→`ended` — via one bound handler set added on attach and removed on destroy.
- [ ] **10.5.4** Translate `MediaError` codes into the taxonomy — `MEDIA_ERR_SRC_NOT_SUPPORTED`→`unsupported`, `MEDIA_ERR_NETWORK`→`network`, `MEDIA_ERR_DECODE`→`media` — with the raw code preserved in `detail` for diagnostics.
- [ ] **10.5.5** Keep recovery out of scope — the engine reports `waiting`/`error` states faithfully; stall watchdogs and retry logic belong to Phase 11's fallback chain and Phase 23's resilience work; note the boundary.
- [ ] **10.5.6** Implement `setVolume` against the element's `volume`/`muted` properties, honoring the interface's engine-applies-host-owns split from Feature 10.2.
- [ ] **10.5.7** Bundle `NativeEngine` inside the lazily loaded player core chunk — it is tiny and always needed once playback starts, so it costs the browse UI nothing and needs no chunk of its own; note the placement.
- [ ] **10.5.8** Route `play()` calls through the Feature 10.6 autoplay handling rather than calling `video.play()` bare — the engine never assumes playback permission.
- [ ] **10.5.9** Unit-test with a stubbed media element — scripted event sequences (load→playing, load→error(3), playing→waiting→playing) assert the exact callback stream and the taxonomy mapping.
- [ ] **10.5.10** Run the shared interface-contract suite from Feature 10.2 against `NativeEngine`, then manually smoke a real mp4 fixture and an https radio stream on the built `dist/` — the radio path doubles as the audio-through-video-element proof.

## Feature 10.6 — Autoplay policy handling (muted-start fallback + unmute affordance)

Browsers reject un-gestured `play()` calls with `NotAllowedError` — the honest response is one muted retry plus a visible unmute chip, never silent failure and never retry loops.

- [ ] **10.6.1** Wrap playback starts in `startPlayback(video)` in the host — it awaits `video.play()` and branches explicitly on a rejected promise instead of letting the rejection escape.
- [ ] **10.6.2** On `NotAllowedError`, retry exactly once with `video.muted = true` — the muted-start fallback that satisfies every autoplay policy — and treat success as playing-but-policy-muted.
- [ ] **10.6.3** Track `player.mutedByPolicy` as its own state flag, distinct from user-initiated mute, so the UI can tell "browser muted this" from "you muted this".
- [ ] **10.6.4** Render the unmute affordance — a "Tap to unmute" chip on the dock, visible only while `mutedByPolicy` is set, wired to a `data-action` that unmutes and clears the flag.
- [ ] **10.6.5** Restore persisted volume on unmute — clearing policy-mute reapplies the volume-memory setting rather than whatever level the element held.
- [ ] **10.6.6** Cap the ladder — if even the muted retry rejects, surface a `media`-kind error with a play button (an explicit gesture always satisfies the policy); no loops, no timers.
- [ ] **10.6.7** Establish where the path triggers — click-to-play carries user activation and normally succeeds unmuted; the fallback exists for activation-expired edge cases and future non-gesture starts, and boot session-restore deliberately renders the last channel playable without autoplaying (per §6.4); note the decision.
- [ ] **10.6.8** Source the chip text from the strings module and style it from tokens — instant appearance, no transition, thumb-sized hit target for touch and TV.
- [ ] **10.6.9** Unit-test the ladder with a mocked `play()` — resolve, reject-then-muted-resolve, and reject-reject paths assert the exact `mutedByPolicy` and error-state outcomes, including single-retry discipline.
- [ ] **10.6.10** Manually verify the policy matrix on the deployed Pages URL — Chrome and Safari, gestured and non-gestured starts — and record the observed behaviors in this file.

## Feature 10.7 — Player state store (idle/loading/playing/buffering/error in state/player)

Playback state lives in Spektrum like everything else — compact scalars driven only through actions, snapshotting the session per §6.3 so the §6.4 instant-restore boot path has something to restore.

- [ ] **10.7.1** Create `src/state/player.ts` — `player.status` (`idle | loading | playing | buffering | error`), `player.active` (channel snapshot), `player.error` (taxonomy kind + detail), `player.mutedByPolicy`.
- [ ] **10.7.2** Drive every transition through `defineFn` actions the host calls from engine callbacks — engines stay framework-free (Feature 10.2's fence), and the action layer remains the §6.3 persistence choke point.
- [ ] **10.7.3** Shape `player.active` as the denormalized snapshot from §6.4 — id, name, stream URL, logo, group, sourceId — everything needed to render and replay the channel with no playlist loaded.
- [ ] **10.7.4** Implement `setActiveChannel` per the §6.3 sample — set `player.active`, push onto `player.zapHistory` via `pushCapped(…, 20)`, and `persist()` both keys through the debounced bridge.
- [ ] **10.7.5** Derive UI state with `computed()` — dock visibility (`status !== 'idle'`), a status label from the strings module, and an error-visible flag — so templates bind derivations, not raw status strings.
- [ ] **10.7.6** Carry the taxonomy through `player.error` — kind plus a redaction-safe detail string (never a raw URL with credentials), the record Phase 23's error surfaces read.
- [ ] **10.7.7** Keep every player.* value history-safe — scalars and one small snapshot object, comfortably inside §5.8's recorded-state rules; assert via the Phase 08 setValue guard staying silent.
- [ ] **10.7.8** Spec transition legality as a table — legal edges (`idle→loading`, `loading→playing`, `playing→buffering→playing`, any→`error`, `error→loading` on retry) pass; illegal jumps throw in dev mode.
- [ ] **10.7.9** Verify the restore path end to end — boot rehydrates `player.active` before `run()` per §6.4, the dock area renders the last channel ready-to-play without autoplaying, and pressing play starts it (the plan's instant-session-restore promise).
- [ ] **10.7.10** Document the state shape and action list in the module's JSDoc as the contract Phases 11 (engine states), 12 (transport UI), and 13 (recent feed) build against.

## Feature 10.8 — Active-channel handoff (list click → setActiveChannel action → host reacts)

The click-to-play seam — the Phase 08 dispatch stub becomes the real §6.3 action, the action drives the host, and zapping inherits latest-wins semantics through one code path.

- [ ] **10.8.1** Replace the Phase 08 `setActiveChannel` stub with the real action — list click and Enter-on-selection now dispatch the full §6.3-shaped implementation from Feature 10.7.
- [ ] **10.8.2** Let the action invoke `host.playChannel(channel)` directly — the action layer is the deterministic trigger and state is the record, rather than the host observing state changes; recorded as a decision note (per §6.3's "persistence through the action layer" philosophy).
- [ ] **10.8.3** Trigger the lazy player-module import from the action's first invocation — the Feature 10.1 boundary — with `status: 'loading'` set immediately so the dock appears while the chunk loads.
- [ ] **10.8.4** Inherit zap semantics — rapid successive dispatches flow into the host's latest-wins serialization; each prior engine is destroyed per §5.3, and `zapHistory` records every zap up to its cap of 20.
- [ ] **10.8.5** Expose an `onActiveChannel` hook from the action for Phase 13's recent-view feed — the subscription point exists and is tested now, so recent tracking bolts on without touching this seam; note the forward contract.
- [ ] **10.8.6** Keep selection and playback decoupled — arrowing through the list moves `list.selectedId` without dispatching playback; only Enter or click plays, preserving browse-while-playing (Feature 08.7's split).
- [ ] **10.8.7** Bind ←/→ zap while playing per plan §9 — step `player.active` through the current filtered row order from the list's module memory, reusing the same action for every entry path.
- [ ] **10.8.8** Handle zap at the edges — ←/→ at the first/last row of the current order clamps rather than wrapping; recorded as a decision note for Phase 12 to revisit with the transport UI.
- [ ] **10.8.9** Integration-test the handoff — click → `status: 'loading'` → stub-engine `playing`, with `player.active`, `zapHistory`, and the persistence bridge's debounced write all asserted.
- [ ] **10.8.10** Test rapid-zap correctness — five dispatches in 200 ms yield one attached engine (the last), four destroyed engines, and a `zapHistory` recording all five in order.

## Feature 10.9 — Teardown discipline (destroy-before-create, src release, zap 100 channels leak-free — MASTERPLAN.md §5.3)

Every engine instance holds a MediaSource, XHRs, and timers — §5.3 calls unmanaged zapping a guaranteed tab crash, so teardown is enforced in exactly one place and proven with a scripted 100-channel zap.

- [ ] **10.9.1** Enforce destroy-before-create in `host.playChannel` verbatim per §5.3 — `current?.destroy(); current = null;` before anything else, so even a throwing setup path leaves no zombie engine reference.
- [ ] **10.9.2** Release the element between engines — `video.removeAttribute('src')` then `video.load()` — freeing the previous MediaSource before the next engine attaches.
- [ ] **10.9.3** Verify listener hygiene mechanically — a dev-mode wrapper counts listeners the engine adds to the video element and asserts zero remain after `destroy()`, catching leaked handlers the moment an engine misbehaves.
- [ ] **10.9.4** Cancel in-flight setup on teardown — destroying an engine mid-`attach` aborts its pending work via the destroy contract, coordinated with the Feature 10.4 playback token so late async completions are no-ops.
- [ ] **10.9.5** Tear down on error paths too — an engine reporting a fatal error is destroyed before the error state is surfaced, so retry always starts from a clean slate and no zombie engine idles behind an error panel.
- [ ] **10.9.6** Add a leak canary for test builds — a `FinalizationRegistry` registers each created engine and the zap test asserts destroyed engines actually become collectable, not just dereferenced.
- [ ] **10.9.7** Script the §5.3 acceptance run — a Playwright test zapping through 100 channels of local fixture streams on the built `dist/`, asserting exactly one live engine throughout.
- [ ] **10.9.8** Measure heap across the zap run — capture usage every 10 zaps; the trend must be flat after GC, with the numbers recorded in this phase file as the leak baseline.
- [ ] **10.9.9** Define stop semantics for the dock's interim close — stopping playback destroys the engine, releases src, and returns `status` to `idle`; pause-without-teardown waits for Phase 12's transport; note the decision.
- [ ] **10.9.10** Anchor the discipline in code — a comment block atop `host.ts` citing MASTERPLAN.md §5.3 and stating the one-place rule, so no future engine or feature adds a second teardown path.

## Feature 10.10 — Mixed-content detection and messaging (https page + http stream, §5.9)

An `https://` page cannot load `http://` streams and the browser fails silently — detecting it before the player does turns a mystifying dead stream into an honest explanation with a real way forward.

- [ ] **10.10.1** Implement `mixedContentBlocked(streamUrl)` in `src/player/mixed-content.ts` per §5.9 — `location.protocol === 'https:'` and the stream resolves to `http:` — as a pure, trivially testable predicate.
- [ ] **10.10.2** Check before engine selection in `playChannel` — a blocked stream short-circuits to a `mixed-content`-kind error state with no engine chunk loaded and no doomed fetch attempted.
- [ ] **10.10.3** Write the explanation per §5.9's guidance — the browser silently blocks insecure streams on a secure page, and the desktop (Electron) build does not have this limit — in plain words through the strings module.
- [ ] **10.10.4** Gate on platform capability — when `capabilities.corsUnrestricted` is true (the future Electron adapter), the check is skipped entirely, flipping the behavior per plan §8.4 with zero UI changes.
- [ ] **10.10.5** Stay honest about the proxy — an https proxy template could front the playlist, but hls.js/mpegts.js fetch segments directly and those remain blocked; the message therefore does not offer the proxy as a mixed-content fix; note the reasoning.
- [ ] **10.10.6** Harden URL parsing — wrap `new URL(streamUrl)` so malformed stream URLs classify as `unsupported` errors instead of throwing inside the predicate; protocol-relative `//host/…` URLs resolve against the page origin and pass correctly.
- [ ] **10.10.7** Keep `mixed-content` a first-class taxonomy kind (Feature 10.2's enum) so Phase 23 can style and prioritize it differently from generic network failures.
- [ ] **10.10.8** Scope the check to streams only — logo mixed-content is already absorbed by Feature 08.4's image fallback, and playlist-URL mixed content by Feature 07.4's import pre-check; this feature owns exactly the playback path.
- [ ] **10.10.9** Unit-test the matrix — https page × {http, https, protocol-relative, malformed} stream URLs, plus the capability-gated skip — asserting blocked/allowed/unsupported for each.
- [ ] **10.10.10** Manually verify on the real Pages deployment — attempt an `http://` fixture stream over the `https://` origin and confirm the specific message appears pre-flight with no network attempt in DevTools; record the observation in this file.
