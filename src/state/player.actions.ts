import { appState, defineFn, getPathObj, setValue } from 'spektrum';
import { pushCapped } from './collections';
import { persist } from './persist';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import type { ActiveChannelSnapshot } from './records';
import { set } from './typed';

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
}

/** MVP playback slice: clears `player.active`, which `src/player/bindings.ts`'s `watch()` reacts to by tearing the `<video>` element down — the `setValue()` fence (Feature 05.2.5) keeps that write here, not in `src/player/`. */
export function stopPlayback(): void {
    setValue(PLAYER_ACTIVE, null);
}

export function setActiveChannel(channel: ActiveChannelSnapshot): void {
    setValue(PLAYER_ACTIVE, channel);
    const zapHistory = getPathObj<ActiveChannelSnapshot[]>(appState, PLAYER_ZAP_HISTORY) ?? [];
    // Array-bearing write — routed through the typed `set()` (Feature
    // 05.9.2) so the dev-mode bulk-data guard (Feature 05.8.2) actually
    // gets a chance to catch a runaway zap-history size; scalar writes
    // elsewhere in this module have nothing for the guard to check, so
    // they stay on the plain `setValue` import.
    set(PLAYER_ZAP_HISTORY, pushCapped(zapHistory, channel, ZAP_HISTORY_CAP, (c) => c.id));
    persist(PLAYER_ACTIVE);
    persist(PLAYER_ZAP_HISTORY);
}
