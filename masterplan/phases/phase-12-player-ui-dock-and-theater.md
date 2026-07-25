# Phase 12 — Player UI: Dock & Theater

> **Epic goal:** Give playback its two presentations — a bottom dock that keeps the channel list usable and a theater mode that collapses the UI to the icon rail — with engine-neutral transport controls, persisted volume, keyboard-driven zapping, fullscreen, and status surfaces, all instant and layout-stable.
> **Verification:** On the built `dist/`: playing a channel raises the dock with exactly one intended layout change and zero unexpected `layout-shift` entries from the 12.10 observer; dock↔theater↔fullscreen switches are instant (no CSS transitions) and never interrupt the running engine; a volume set before reload is restored and identical across hls.js, mpegts.js, and native sessions; holding ArrowRight skims 30 channels but commits exactly one engine creation; space/m/f/arrow keys behave per the keymap while typing in search stays unaffected; buffering and failure render as spinner-free text states with the 11.8 details behind a disclosure.

Before this phase, the Phase 11 engines play reliably but into a bare video surface with no real presentation, controls, or status UI. After this phase, the shell owns a persistent player container presented as a fixed-height bottom dock or a rail-collapsed theater view, `src/app/keymap.ts` centralizes playback shortcuts, transport controls and the now-playing line are wired through Spektrum state, volume persists across sessions and engines, and the Phase 11 status/error signals have visible, animation-free homes — with the `f` favorite slot and the EPG "now" slot stubbed for Phases 13 and 17.

## Feature 12.1 — Bottom dock layout (fixed height, no layout shift on appear)

The dock is the default playback presentation: a fixed-height bar under the list so browsing continues while a channel plays. Its appearance is one deliberate grid change, never a cascade of reflows.

- [ ] **12.1.1** Add the dock as a shell-level grid row sized by a `--dock-h` token (64 px) in `src/styles/tokens.css`, with its markup partial owned by `src/ui/player-dock.ts`.
- [ ] **12.1.2** Show the dock via `data-if` on `computed('ui.dockVisible', …)` derived from `player.status !== 'idle'` and `ui.playerMode === 'dock'` — appearance is one synchronous state change, no CSS transition.
- [ ] **12.1.3** Create the `<video>` element once in the shell as the single persistent player surface — dock and theater reposition it purely via CSS classes; the engine host never re-creates or re-parents it mid-session.
- [ ] **12.1.4** Lay out the dock internals — fixed-size video surface, info line, transport cluster — as one flex row with `text-overflow: ellipsis` and fixed-dimension boxes so nothing inside the dock ever shifts.
- [ ] **12.1.5** Derive the virtual-list viewport height from the same grid so a dock appearance re-runs the Phase 8 windowing controller's `publishWindow()` exactly once via a resize hook.
- [ ] **12.1.6** Dispatch `defineFn('playChannel', row)` from a channel-row click — set the `player.active` denormalized snapshot, invoke the engine host, and flip the dock visible in the same action.
- [ ] **12.1.7** Wire the stop/close control to tear down completely: engine destroyed (§5.3), `player.status = 'idle'`, dock hidden, and the list regaining its height in the same frame.
- [ ] **12.1.8** Mount the dock at shell level above view switching — navigating Sources/Favorites/Recent/Settings never unmounts it or interrupts playback.
- [ ] **12.1.9** Keep `src/ui/player-dock.ts` ≤300 lines by leaving transport logic to 12.3 and status text to 12.8 — the dock file is layout and wiring only.
- [ ] **12.1.10** Manual smoke on the built `dist/`: play, navigate all views, stop — the dock appears and disappears with no visible movement beyond the intended list resize.

## Feature 12.2 — Theater mode (list collapses to rail, instant switch)

Theater is the lean-back presentation: the channel list collapses to the 56 px icon rail and the player fills the content area. Switching modes is a class swap — the engine, buffer, and session carry over untouched.

- [ ] **12.2.1** Introduce `ui.playerMode` (`'dock' | 'theater'`) with `defineFn('setPlayerMode')` as its only writer — no view flips the mode by direct `setValue`.
- [ ] **12.2.2** Implement theater as a root-level class swap: the list collapses to the icon rail, the persistent player container expands to fill the content area — one synchronous change, no animation.
- [ ] **12.2.3** Enter theater from the dock's expand button and from double-click on the dock video; exit via a collapse button and Esc through the 12.9 keymap.
- [ ] **12.2.4** Resize the shared `<video>` element with CSS only across mode switches — playback, buffered ranges, and engine state must carry over bit-for-bit.
- [ ] **12.2.5** Keep the rail interactive in theater — clicking a rail icon exits to dock mode and navigates in one action; record this as a decision note.
- [ ] **12.2.6** Pause the windowing controller's publishing while the list is collapsed (zero visible rows) and republish once on return — no hidden 40-row diffs during theater.
- [ ] **12.2.7** Snapshot `ui.playerMode` through the §6.3 persistence bridge so a reload during theater restores theater together with the §6.4 restored session channel.
- [ ] **12.2.8** Move keyboard focus to the player container on enter and back to the active list row on exit — groundwork for the Phase 25 roving-focus model.
- [ ] **12.2.9** Unit-test the mode action: dock→theater→dock leaves the engine untouched (destroy spy uncalled), and Esc maps to theater-exit only when not fullscreen.
- [ ] **12.2.10** Manual smoke: toggle modes 20× rapidly on the built `dist/` — no dropped playback, no layout thrash, no console errors.

## Feature 12.3 — Transport controls (play/pause/stop, mute, volume slider)

One transport cluster, rendered in dock and theater from a single partial, driving the shared video element through engine-neutral actions — the media element, not the buttons, is the source of truth.

- [ ] **12.3.1** Build the transport cluster markup with `data-action` bindings — play/pause, stop, mute, volume slider — as one partial stamped into both dock and theater placements.
- [ ] **12.3.2** Implement `defineFn('togglePlayPause')` calling `video.play()`/`video.pause()` on the shared element, mirroring button state from the media `play`/`pause` events rather than assuming success.
- [ ] **12.3.3** Implement `defineFn('stopPlayback')` — destroy the engine through the host, clear the presentation state, return to browse — semantically distinct from pause.
- [ ] **12.3.4** Wire the mute toggle to `video.muted` plus `setValue('player.muted', …)`, deriving the icon from state via `computed()`.
- [ ] **12.3.5** Bind the volume slider (`<input type="range">`, 0–1) with `data-model` to `player.volume`, applying to `video.volume` synchronously on input.
- [ ] **12.3.6** Expose disabled states via computed values — play/pause disabled while `player.status === 'failed'`, the whole cluster disabled when idle.
- [ ] **12.3.7** Branch on `player.isLive` from 11.6: live sessions hide the position affordance; VOD sessions show elapsed/duration text fed by `timeupdate` throttled to one update per second.
- [ ] **12.3.8** Source every label ("Play", "Mute", …) from the central strings module as `aria-label`s — buttons are icon-only visually, never hardcoded literals.
- [ ] **12.3.9** Unit-test the actions against a stubbed video element: pause→play round-trip, stop destroys exactly once, mute toggle is idempotent under key-repeat.
- [ ] **12.3.10** Manual smoke across engines: the transport behaves identically on hls.js, mpegts.js, and native sessions on the built `dist/`.

## Feature 12.4 — Volume persistence (single persisted volume key shared by all engines)

Volume is set once and respected forever: one persisted key, applied before every attach, surviving reloads and engine switches — with the guarded write path keeping quota failures out of the slider handler.

- [ ] **12.4.1** Make `player.volume` the single volume key in Spektrum state — every engine session applies it to the shared `<video>` on attach; no engine keeps a private copy.
- [ ] **12.4.2** Persist through the §6.3 action layer — volume and mute actions call `persist('player.volume')` / `persist('player.muted')` so a slider drag debounces into one storage write.
- [ ] **12.4.3** Add both keys to the boot `getMany` batch in `src/main.ts` so the restored volume is live before the session's first playback.
- [ ] **12.4.4** Route storage through the StorageAdapter so the partial tier's guarded localStorage write (§5.7) absorbs quota failure by demoting — never a throw inside the slider handler.
- [ ] **12.4.5** Clamp and validate on rehydrate: non-finite or out-of-range stored values reset to the 1.0 default instead of poisoning the media element.
- [ ] **12.4.6** Apply volume before `play()` in the engine-host attach sequence — no audible blast at default volume before the restore lands.
- [ ] **12.4.7** Store mute separately from level so unmuting restores the prior level, matching platform conventions.
- [ ] **12.4.8** Zap-test the invariant: hls → mpegts → native zaps retain the exact slider value with no re-read from storage between engines.
- [ ] **12.4.9** Unit-test the round-trip on the memory tier: set 0.37, snapshot, rehydrate, and assert a stubbed video element receives 0.37.
- [ ] **12.4.10** Manual smoke: set a volume, reload the built `dist/`, play — audio resumes at the saved level on both the full and partial tiers.

## Feature 12.5 — Channel zap (ArrowLeft/ArrowRight through the current filtered list, zap history updated)

Zapping is the core TV gesture: arrows step through the list the user is actually looking at — the filtered result set — with rapid presses coalesced so holding a key never thrashes engines.

- [ ] **12.5.1** Implement `defineFn('zap', direction)` in `src/state/player.actions.ts` — resolve the neighbor of `player.active` within the current Phase 9 filtered result array, not the full playlist.
- [ ] **12.5.2** Read the filtered array from module memory via a `src/ui/virtual-list.ts` accessor — the 90 k array never enters recorded Spektrum state for zapping (§5.8).
- [ ] **12.5.3** Wrap around at both ends, and fall back to full channel order when the active channel is absent from the current filter — document the fallback decision inline.
- [ ] **12.5.4** Register ArrowLeft/ArrowRight in the 12.9 keymap gated on an active playback session — arrows do nothing playback-related while browsing idle.
- [ ] **12.5.5** Coalesce rapid zaps with a 250 ms trailing debounce that plays only the final target — holding an arrow skims names in the info line without an engine create/destroy per keypress.
- [ ] **12.5.6** Route every committed zap through the engine host's destroy-before-create path (§5.3) and the 11.5 fallback chain like any other play request.
- [ ] **12.5.7** Update zap history inside the same action via the §6.3 `pushCapped(…, 20)` pattern plus `persist('player.zapHistory')`.
- [ ] **12.5.8** Follow the zap in the list: the windowing controller scrolls the active row into view whenever it leaves the current viewport.
- [ ] **12.5.9** Unit-test neighbor resolution — filtered list, wrap-around, active-not-in-filter fallback — and debounce coalescing with fake timers.
- [ ] **12.5.10** Manual smoke: hold ArrowRight across 30 channels on the built `dist/` — one engine creation on release, history records the final channel, heap stays stable.

## Feature 12.6 — Now-playing info line (channel name + EPG now when available)

One truncating line answers "what am I watching": logo, channel name, and — once Phase 17 delivers EPG — the current program, recomputed only on the global tick.

- [ ] **12.6.1** Build the info-line partial for dock and theater: logo in a fixed box, channel name, and a "now" program slot — one flex line with ellipsis truncation.
- [ ] **12.6.2** Add `computed('player.nowPlayingLabel', …)` joining `player.active` with an optional EPG now-lookup — the computed ships now; Phase 17 starts feeding it.
- [ ] **12.6.3** Render the program slot as empty (reserving no width) until EPG exists — no placeholder dashes, no churn when Phase 17 starts filling it.
- [ ] **12.6.4** Recompute the label only on the global 30 s `epg.tick` (§5.5) — the info line owns zero timers of its own.
- [ ] **12.6.5** Show the group name in place of the program slot for radio/audio-only sessions detected by 11.7.
- [ ] **12.6.6** Take all strings and time formatting from the central strings module — no hardcoded literals in the partial.
- [ ] **12.6.7** Mirror the channel name into `document.title` ("Channel — ThunderTV") on session start and reset it on stop.
- [ ] **12.6.8** Fall back to the neutral glyph in the same fixed box on logo failure — the line never shifts.
- [ ] **12.6.9** Unit-test the computed for: no EPG data, EPG present, radio session, and idle.
- [ ] **12.6.10** Manual check: a long channel name truncates with ellipsis in a 320 px-wide dock without wrapping or pushing the transport cluster.

## Feature 12.7 — Fullscreen support (Fullscreen API, controls overlay, Esc handling)

Fullscreen goes on the player container — not the bare video — so DOM controls stay usable, with `fullscreenchange` as the single source of truth and an overlay that appears and hides instantly.

- [ ] **12.7.1** Implement `defineFn('toggleFullscreen')` calling `requestFullscreen()` on the player container so the DOM-rendered transport cluster remains available in fullscreen.
- [ ] **12.7.2** Treat the `fullscreenchange` event as the only writer of `ui.fullscreen` — Esc, F11, and programmatic exits all converge on one code path.
- [ ] **12.7.3** Place the fullscreen button in the transport cluster, independent of theater — a dock session may go fullscreen directly.
- [ ] **12.7.4** Build the controls overlay: pointer movement shows the cluster, a single 3 s timer hides it via `display` toggle — instant show/hide, no fade, per the no-animation rule.
- [ ] **12.7.5** Order Esc handling explicitly: the browser-native fullscreen exit wins; the 12.9 keymap maps Esc to theater-exit only when `ui.fullscreen` is false.
- [ ] **12.7.6** Wrap the WebKit-prefixed API (`webkitRequestFullscreen`) behind one adapter function for TVs and older Safari.
- [ ] **12.7.7** Hide the cursor together with the controls in fullscreen via a `cursor: none` container class.
- [ ] **12.7.8** Re-run the windowing/resize hooks on fullscreen changes so exiting restores the exact pre-fullscreen list geometry.
- [ ] **12.7.9** Unit-test state sync with a mocked Fullscreen API: request → change event → `ui.fullscreen` true; Esc-driven change → false; the hide timer cleared on exit.
- [ ] **12.7.10** Manual smoke: enter fullscreen from both dock and theater, verify overlay show/hide and Esc exit, and confirm zero layout jump on return.

## Feature 12.8 — Buffering and error indicators in the dock (spinner-free: text/icon status, no animation)

Status is communicated in words and static glyphs — never spinners. The dock renders the Phase 11 status vocabulary, debounced against flicker, with the classified failure message and retry inline.

- [ ] **12.8.1** Fix the status contract as `player.status ∈ { idle, loading, buffering, playing, recovering, failed }` — the values Phase 11 engines and the fallback chain already publish become the dock's only input.
- [ ] **12.8.2** Drive `buffering`↔`playing` from the media `waiting`/`playing`/`stalled` events in the engine host, debounced 250 ms so micro-stalls never flicker the text.
- [ ] **12.8.3** Render status text from the strings module — "Buffering…", "Reconnecting…" for recovering — as plain text plus a static glyph; zero animation anywhere in the status area.
- [ ] **12.8.4** Render the failed state with the 11.8 plain-words classification and its "Show details" disclosure inline in the dock.
- [ ] **12.8.5** Add the Retry affordance on failed: one button re-enters the 11.5 fallback chain from the first candidate; repeated failure re-shows the classified message (Phase 23 extends these flows).
- [ ] **12.8.6** Surface a hint line when live buffering exceeds 10 s, referencing the live-edge jump the 11.6 watchdog is about to perform.
- [ ] **12.8.7** Draw status glyphs as fixed-dimension inline SVG inside a fixed-size box so status changes cause no dock reflow.
- [ ] **12.8.8** Reuse one status partial across dock, theater, and fullscreen overlay — three placements, single template.
- [ ] **12.8.9** Unit-test the debounce and mapping: `waiting`→`playing` inside 250 ms shows no buffering flash; chain exhaustion renders failed with the correct strings key.
- [ ] **12.8.10** Manual smoke: throttle to 3G in devtools — buffering shows as text (no spinner), recovery text appears during backoff, and a killed stream shows the failure with details.

## Feature 12.9 — Keyboard shortcut wiring (space, m, f, arrows — via a central keymap module)

All playback keys live in one declarative table with one document listener — guarded against text inputs, exported for the settings help and the future TV-remote mapping, and never claiming keys that belong to other views.

- [ ] **12.9.1** Create `src/app/keymap.ts` — one document-level `keydown` listener over a declarative table `{ key, when, action }` dispatching `defineFn` actions; ≤300 lines.
- [ ] **12.9.2** Guard inputs: events originating in `input`, `textarea`, or contenteditable elements pass through untouched — typing in search never triggers playback keys.
- [ ] **12.9.3** Map Space → `togglePlayPause` with `preventDefault()` against page scroll, gated `when: sessionActive`.
- [ ] **12.9.4** Map `m` → mute toggle, and `f` → the favorite-toggle slot for the focused/active row — Phase 13 supplies the real action; register a no-op stub now with a decision note.
- [ ] **12.9.5** Map ArrowLeft/ArrowRight → `zap` per 12.5 gated on an active session, and explicitly leave ArrowUp/ArrowDown to the list's navigation (plan §9) — the keymap does not claim them.
- [ ] **12.9.6** Map Esc → theater exit per 12.7's ordering rule, and record `/` (focus search, Phase 9's handler) in the table as an unclaimed key — one place documents claimed vs unclaimed.
- [ ] **12.9.7** Export the table so Phase 22's settings help and Phase 25's TV-remote mapping consume it instead of re-declaring bindings.
- [ ] **12.9.8** Guarantee single registration via an idempotent `initKeymap()` called once from `src/main.ts` — safe under dev hot-reload.
- [ ] **12.9.9** Unit-test dispatch: Space inside a search input does nothing; Space with an active session toggles; `f` reaches the slot; unknown keys fall through untouched.
- [ ] **12.9.10** Manual smoke: drive the app keyboard-only — Enter plays, Space pauses, `m` mutes, ←/→ zap, `f` hits the stub, Esc exits theater — without touching the mouse.

## Feature 12.10 — Layout stability rules (reserved dock space strategy, no CLS when playback starts/stops)

The anti-jank rules become measured guarantees: one documented space strategy, an instrumented layout-shift observer, and fixed-size boxes audited everywhere the player UI can change.

- [ ] **12.10.1** Decide and document the reserved-space strategy — the dock grid row participates only when visible and the list viewport is sized by grid math, making the intended one-time resize the only permitted movement; record it in a `tokens.css` comment block and a note here.
- [ ] **12.10.2** Instrument dev builds with `new PerformanceObserver(...)` observing `layout-shift` entries, flagging any unexpected CLS while playback starts, stops, or switches modes.
- [ ] **12.10.3** Verify start-playback produces exactly one layout change (the list shrink) — no secondary shifts from fonts, logos, or status text, thanks to the 12.1/12.8 fixed boxes.
- [ ] **12.10.4** Verify stop-playback and theater↔dock produce symmetric single changes, and fullscreen toggles produce none (fullscreen is compositor-level).
- [ ] **12.10.5** Audit that volume drags, status text swaps, and info-line updates generate zero `layout-shift` entries — every dynamic region sits in a fixed-size container.
- [ ] **12.10.6** Constrain all logos across dock, theater, and the 11.7 station layout to fixed-dimension boxes with `object-fit` — a slow logo load shifts nothing.
- [ ] **12.10.7** Codify the rule in `src/styles/`: dock and theater classes take explicit heights from tokens, with a comment marking them as CLS-guarded values changed only alongside a re-run of this check.
- [ ] **12.10.8** Re-verify the ≤~40 DOM-row budget while the dock is visible — a smaller viewport must mean fewer published rows, never more.
- [ ] **12.10.9** Add a Vitest DOM test asserting no element in the CLS-audited dock template set lacks explicit dimensions — a best-effort static guard against regressions.
- [ ] **12.10.10** Run the full start/stop/theater/fullscreen cycle on the built `dist/` with the layout-shift logger and record "zero unexpected entries" in this phase's notes.
