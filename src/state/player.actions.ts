import { appState, defineFn, getPathObj, refs, setValue } from 'spektrum';
import { requestElementFullscreen, requestVideoFullscreen } from '../player/fullscreen';
import { cycleRadioVisualizerPreset } from '../player/visualizer';
import { pushCapped } from './collections';
import { persist } from './persist';
import {
    isAudioVisual,
    PLAYER_ACTIVE,
    PLAYER_ACTIVE_VARIANT_ID,
    PLAYER_AUDIO_MODE,
    PLAYER_PLAYBACK_ERROR,
    PLAYER_STREAM_HEALTH,
    PLAYER_VARIANTS,
    PLAYER_VISUALIZER_PAUSED,
    PLAYER_VISUALIZER_PRESET,
    PLAYER_ZAP_HISTORY,
    ZAP_HISTORY_CAP,
} from './player';
import type { ActiveChannelSnapshot } from './records';
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
    defineFn('player/stop', () => {
        stopPlayback();
    });
    // No state mutation involved (only a read) — registered here anyway
    // because every defineFn is registered before bindDOM()
    // (registerActions()'s contract); the fullscreen mechanics live in
    // src/player/fullscreen.ts. Whenever the visualizer is standing in for
    // the picture — Radio always, a TV channel in audio mode — there is no
    // picture to fullscreen, so it targets the visualizer pane instead of
    // the (visually collapsed) `<video>`; see player.css's
    // `.player-shell--audio` rule.
    defineFn('player/fullscreen', () => {
        if (audioVisualActive()) {
            const canvas = refs['radioVisualizer'];
            const pane =
                canvas instanceof HTMLElement ? canvas.closest('.radio-now-playing') : null;
            if (pane instanceof HTMLElement) requestElementFullscreen(pane);
            return;
        }
        const video = refs['playerVideo'];
        if (video instanceof HTMLVideoElement) requestVideoFullscreen(video);
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
    defineFn('player/setVisualizerPreset', (el) => {
        if (el instanceof HTMLSelectElement) setVisualizerPreset(el.value);
    });
    defineFn('player/toggleVisualizerPause', () => {
        setValue(PLAYER_VISUALIZER_PAUSED, !(get<boolean>(PLAYER_VISUALIZER_PAUSED) ?? false));
    });
    defineFn('player/toggleAudioMode', () => {
        toggleAudioMode();
    });
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

/** MVP playback slice: clears `player.active`, which `src/player/bindings.ts`'s `watch()` reacts to by tearing the `<video>` element down — the `setValue()` fence (Feature 05.2.5) keeps that write here, not in `src/player/`. */
export function stopPlayback(): void {
    setValue(PLAYER_ACTIVE, null);
    setValue(PLAYER_PLAYBACK_ERROR, null);
    setValue(PLAYER_STREAM_HEALTH, null);
    setValue(PLAYER_ACTIVE_VARIANT_ID, null);
    // Array-bearing write: `replace()` rather than `setValue`, since
    // Spektrum deep-merges objects and would otherwise leave the previous
    // channel's variants behind.
    replace(PLAYER_VARIANTS, []);
}

/** Called by `src/player/engine.ts` when a stream dies (hls.js fatal error or the native element's `error` event) — the one visible diagnostic a phone user can screenshot. `null` clears it on a fresh attach. */
export function reportPlaybackError(detail: string | null): void {
    setValue(PLAYER_PLAYBACK_ERROR, detail);
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
    setValue(PLAYER_ACTIVE, channel);
    setValue(PLAYER_PLAYBACK_ERROR, null);
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
