import { appState, defineFn, getPathObj, refs, setValue } from 'spektrum';
import { getPlatform } from '../core/platform';
import { currentFullscreenElement, exitFullscreen, requestElementFullscreen, requestVideoFullscreen } from '../player/fullscreen';
import { cycleRadioVisualizerPreset } from '../player/visualizer-lazy';
import { pushCapped } from './collections';
import { persist } from './persist';
import {
    isAudioVisual,
    PLAYER_ACTIVE,
    PLAYER_ACTIVE_VARIANT_ID,
    PLAYER_AUDIO_MODE,
    PLAYER_PAUSED,
    PLAYER_PLAYBACK_ERROR,
    PLAYER_PLAYBACK_NOTICE,
    PLAYER_STREAM_HEALTH,
    PLAYER_VARIANTS,
    PLAYER_VISUALIZER_PAUSED,
    PLAYER_VISUALIZER_PRESET,
    PLAYER_ZAP_HISTORY,
    ZAP_HISTORY_CAP,
} from './player';
import { closeTrackMenu } from './player-tracks.actions';
import type { ActiveChannelSnapshot } from './records';
import { SERIES_NEXT_PROMPT } from './series';
import { announce } from './ui.actions';
import { get, replace, set } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * The reference action from masterplan §6.3, ported exactly: sets the
 * active-channel snapshot, capped-pushes it into zap history (deduped by
 * id), and marks both keys dirty for the persistence bridge. This is the
 * mechanism that makes reboot instant (§6.4).
 *
 * `setActiveChannel()` below is the real, typed entry point — actions may
 * be called directly as plain functions, not only dispatched from DOM
 * events (Feature 05.2.7). No DOM element triggers this one yet (Phase 06+
 * is the first real UI caller); `registerPlayerActions()` still registers
 * the `data-fn="player/setActiveChannel"` wiring so the mechanism is
 * complete and provable today (Feature 05.4.10's manual drill calls
 * `setActiveChannel()` directly from a dev console, the way a future real
 * caller eventually will from a click handler).
 */
export function registerPlayerActions(): void {
    // `value`'s real type from Spektrum's BoundFn is `any` (DOM-bound
    // callers don't have a typed payload) — the typed, documented entry
    // point is the exported `setActiveChannel()` function below.
    defineFn('player/setActiveChannel', (_el, _state, _delta, value: unknown) => {
        setActiveChannel(value as ActiveChannelSnapshot);
    });
    defineFn('player/togglePlayback', () => {
        togglePlayback();
    });
    // No state mutation involved (only a read) — registered here anyway
    // because every defineFn is registered before bindDOM()
    // (registerActions()'s contract); the fullscreen mechanics live in
    // src/player/fullscreen.ts.
    defineFn('player/fullscreen', () => {
        togglePlayerFullscreen();
    });
    // Manual skip alongside the visualizer's own auto-cycle
    // (src/player/visualizer/index.ts's AUTO_CYCLE_MS) — a no-op if the
    // visualizer isn't currently running. Also resets the preference back to
    // 'auto' so the picker's displayed value never drifts from what
    // browsing forward actually put on screen.
    defineFn('player/nextVisualizerPreset', () => {
        setVisualizerPreset('auto');
        cycleRadioVisualizerPreset();
    });
    // Dispatched from the visualizer picker's menu rows (`data-value` is a
    // `VISUALIZER_PICKER_OPTIONS` id). Spektrum coerces a dispatch `value`,
    // so a hypothetical numeric preset id would arrive as a number —
    // `String()` normalizes it back, same reasoning as
    // `player-tracks.actions.ts`'s `trackIdFromValue()`.
    defineFn('player/setVisualizerPreset', (_el, _state, _delta, value: unknown) => {
        if (typeof value !== 'string' && typeof value !== 'number') return;
        setVisualizerPreset(String(value));
        closeTrackMenu();
    });
    defineFn('player/toggleVisualizerPause', () => {
        setValue(PLAYER_VISUALIZER_PAUSED, !(get<boolean>(PLAYER_VISUALIZER_PAUSED) ?? false));
    });
    defineFn('player/toggleAudioMode', () => {
        toggleAudioMode();
    });
}

/**
 * The route a replay has just navigated to on purpose, armed for exactly one
 * `applyRoute()` and read only by the router.
 *
 * `router.ts` stops playback on every real route change — switching tabs must
 * not leave the previous tab's stream running underneath. Replaying a Starred
 * or Recent entry is the one navigation that happens *because* something just
 * started playing: it sets the channel and then sends the viewer to the view
 * that shows it, and the router's rule tore that channel straight back down.
 * Which is what "it switches to that tab but nothing is activated" actually
 * was — playback had already been stopped by the time the tab painted.
 *
 * Armed with the destination rather than a bare flag so an arming that is
 * never consumed (a replay into the view the viewer is already on fires no
 * `hashchange`) cannot leak the exemption into their next real tab switch.
 */
let playbackHandoffRoute: string | null = null;

/** Exempts the next navigation to `route` from the router's stop-on-tab-switch. */
export function keepPlaybackThroughRoute(route: string): void {
    playbackHandoffRoute = route;
}

/** Router-only: true when this route change is the one a replay armed. Consumes the arming either way. @internal */
export function isPlaybackHandoff(route: string): boolean {
    const armed = playbackHandoffRoute;
    playbackHandoffRoute = null;
    return armed !== null && armed === route;
}

/** True while the visualizer pane stands in for the picture — see `player.ts`'s `isAudioVisual()`. */
export function audioVisualActive(): boolean {
    return isAudioVisual(get<string | null>(UI_ACTIVE_VIEW), get<boolean>(PLAYER_AUDIO_MODE) ?? false);
}

/**
 * Flips a TV channel between picture and audio-only-with-visualizer. A
 * persisted preference rather than a per-channel one: someone who watches
 * news as background audio wants that on the next channel too, and on the
 * next visit.
 */
export function toggleAudioMode(): void {
    set(PLAYER_AUDIO_MODE, !(get<boolean>(PLAYER_AUDIO_MODE) ?? false));
    persist(PLAYER_AUDIO_MODE);
}

/**
 * How long to give the browser to actually go fullscreen before the
 * desktop shell falls back to fullscreening its own window. Long enough to
 * cover a real `requestFullscreen()` transition, short enough that a
 * viewer who pressed a button doesn't sit there wondering.
 */
const HOST_FULLSCREEN_FALLBACK_MS = 350;

/**
 * The fullscreen button, for every view that plays something — Live,
 * Radio, Movies, TV Shows.
 *
 * Everything down to the `requestFullscreen()` call is synchronous on
 * purpose: this runs inside the click handler, and an `await` anywhere
 * above it would spend the click's transient user activation, which is the
 * one thing browsers require for page-level fullscreen.
 *
 * The desktop fallback exists because page-level fullscreen is not always
 * granted (Electron routes it through the session's permission handler;
 * `desktop/main.mjs` allows it now, but a refusal for any other reason used
 * to leave the button doing nothing at all). Where the host owns its own
 * window, taking *that* fullscreen is a perfectly good answer — so if
 * nothing on the page claimed fullscreen a moment later, the window does.
 */
export function togglePlayerFullscreen(): void {
    // Toggle, not enter: a TV remote has no dependable Escape key
    // (src/player/fullscreen.ts's header).
    if (currentFullscreenElement()) {
        exitFullscreen();
        return;
    }
    const host = getPlatform().windowFullscreen;
    if (host?.isFullscreen()) {
        // We got here through the fallback below, so the way back out is
        // the same door — `document.exitFullscreen()` has nothing to exit.
        host.setFullscreen(false);
        return;
    }

    requestFullscreenForActiveView();

    if (!host) return;
    window.setTimeout(() => {
        if (currentFullscreenElement() || host.isFullscreen()) return;
        host.setFullscreen(true);
    }, HOST_FULLSCREEN_FALLBACK_MS);
}

/**
 * Whenever the visualizer stands in for the picture — Radio always, a TV
 * channel in audio mode — there is nothing in the `<video>` to fullscreen,
 * so this targets the whole player shell instead. The whole shell, not just
 * `.radio-now-playing`: the control bar (preset picker, pause, next, stop)
 * is a sibling of the visualizer pane, so fullscreening the pane alone left
 * the viewer with no controls and no way back but Escape — which a TV
 * remote may not even have. Everything with a real picture — Live, Movies,
 * TV Shows — fullscreens the shared `<video>`, which carries its own native
 * controls.
 */
function requestFullscreenForActiveView(): void {
    if (audioVisualActive()) {
        const canvas = refs['radioVisualizer'];
        const shell = canvas instanceof HTMLElement ? canvas.closest('.player-shell') : null;
        if (shell instanceof HTMLElement) requestElementFullscreen(shell);
        return;
    }
    const video = refs['playerVideo'];
    if (video instanceof HTMLVideoElement) requestVideoFullscreen(video);
}

/**
 * MVP playback slice: clears `player.active`, which `src/player/bindings.ts`'s
 * `watch()` reacts to by tearing the `<video>` element down — the
 * `setValue()` fence (Feature 05.2.5) keeps that write here, not in
 * `src/player/`.
 *
 * Exits fullscreen first, before any teardown: ESC works today because the
 * browser's own native exit-fullscreen algorithm runs and repaints the page
 * before app code does anything; Stop skipped that entirely and tore the
 * `<video>` down (and hid its ancestor) while the browser still believed it
 * owned the fullscreen layer, leaving that layer stuck on screen with
 * nothing underneath reachable.
 */
export function stopPlayback(): void {
    if (currentFullscreenElement()) exitFullscreen();
    setValue(PLAYER_ACTIVE, null);
    setValue(PLAYER_PLAYBACK_ERROR, null);
    setValue(PLAYER_PLAYBACK_NOTICE, null);
    setValue(PLAYER_STREAM_HEALTH, null);
    setValue(PLAYER_ACTIVE_VARIANT_ID, null);
    setValue(PLAYER_PAUSED, false);
    // Array-bearing write: `replace()` rather than `setValue`, since
    // Spektrum deep-merges objects and would otherwise leave the previous
    // channel's variants behind.
    replace(PLAYER_VARIANTS, []);
}

/**
 * Pauses or resumes the media element in place, leaving `player.active` (and
 * so the row/episode highlight) untouched — unlike `stopPlayback()`, which
 * fully closes the channel. Reused across Live/Radio/Movies/TV Shows since
 * they all share the one `<video>` ref.
 *
 * The preview pane no longer carries a button for this: a `<video controls>`
 * has its own, and a second copy beside it was clutter. The audio-only pane
 * (`.radio-now-playing`, which is a canvas with no native controls) is the
 * one surface that still binds it.
 */
export function togglePlayback(): void {
    const video = refs['playerVideo'];
    if (!(video instanceof HTMLVideoElement)) return;
    if (video.paused) {
        void video.play();
        setValue(PLAYER_PAUSED, false);
    } else {
        video.pause();
        setValue(PLAYER_PAUSED, true);
    }
}

/**
 * Called by `src/player/playback-state-sync.ts` as the `<video>` element
 * actually plays and pauses — the same reporter shape as
 * `reportPlaybackError()`/`reportStreamHealth()` below.
 *
 * The element's own events are the authority on this, not whoever asked for
 * the change: a viewer can pause from the native control bar, by clicking the
 * picture (Chromium toggles on the whole video surface), with a media key, or
 * by tapping the audio-only pane. Only the last of those used to update
 * `player.paused`, so the state could disagree with reality.
 */
export function reportPaused(paused: boolean): void {
    setValue(PLAYER_PAUSED, paused);
}

/** Called by `src/player/engine.ts` when a stream dies (hls.js fatal error or the native element's `error` event) — the one visible diagnostic a phone user can screenshot. `null` clears it on a fresh attach. Stone 3's failure evidence is recorded by the engine itself (`advanceChain()`), not here: the player layer already owns the health monitor, and hooking it here would have `src/state/` reach into `src/player/`. */
export function reportPlaybackError(detail: string | null): void {
    setValue(PLAYER_PLAYBACK_ERROR, detail);
    // A dead stream is the one failure a viewer is guaranteed to be waiting
    // on, so it is the one that most needs saying out loud (Feature 25.8.5).
    // `null` is the clear-on-fresh-attach case and announces nothing.
    if (detail) announce(detail);
}

/**
 * Called by `src/player/audio-output.ts` once a stream has proven it is
 * decoding pictures and no audio at all — the browser has no decoder for
 * what the file carries (AC-3/E-AC-3/DTS on a movie, most often), and the
 * only alternative to saying so is a viewer hunting for a mute button that
 * was never the problem. `null` clears it on the next attach.
 */
export function reportPlaybackNotice(detail: string | null): void {
    setValue(PLAYER_PLAYBACK_NOTICE, detail);
}

/** Called by `src/player/stream-health.ts` as stalls come and go — drives the player-bar signal indicator. */
export function reportStreamHealth(health: string | null): void {
    setValue(PLAYER_STREAM_HEALTH, health);
}

/** Persists the listener's Radio visualizer preference (`'auto'` or a preset id) — `src/player/bindings.ts`'s `watch()` reacts by calling `setRadioVisualizerPreset()`. */
export function setVisualizerPreset(preference: string): void {
    set(PLAYER_VISUALIZER_PRESET, preference);
    persist(PLAYER_VISUALIZER_PRESET);
}

export function setActiveChannel(channel: ActiveChannelSnapshot): void {
    // `replace()`, not `setValue()`: the snapshot's optional `kind`/`radio`/
    // `series` fields are written by only some callers, and a deep-merged
    // write leaves the previous item's on the new one (`map-shaped-keys.ts`).
    replace(PLAYER_ACTIVE, channel);
    // A standing "Next: S02E01" offer belongs to the episode that produced
    // it. Anything becoming active — including the offer being accepted —
    // ends that, so clear it here rather than in each of the several paths
    // that can start playback (Feature 21.6.4).
    replace(SERIES_NEXT_PROMPT, null);
    setValue(PLAYER_PLAYBACK_ERROR, null);
    setValue(PLAYER_PLAYBACK_NOTICE, null);
    setValue(PLAYER_PAUSED, false);
    const zapHistory = getPathObj<ActiveChannelSnapshot[]>(appState, PLAYER_ZAP_HISTORY) ?? [];
    // Array-bearing write — routed through the typed `set()` (Feature
    // 05.9.2) so the dev-mode bulk-data guard (Feature 05.8.2) actually
    // gets a chance to catch a runaway zap-history size; scalar writes
    // elsewhere in this module have nothing for the guard to check, so
    // they stay on the plain `setValue` import.
    set(
        PLAYER_ZAP_HISTORY,
        pushCapped(zapHistory, channel, ZAP_HISTORY_CAP, (c) => c.id),
    );
    persist(PLAYER_ACTIVE);
    persist(PLAYER_ZAP_HISTORY);
}
