import { defineFn, refs, watch } from 'spektrum';
import {
    getPlayerTracks as engineGetPlayerTracks,
    onTracksChanged as engineOnTracksChanged,
    setAudioTrack as engineSetAudioTrack,
    setSubtitleTrack as engineSetSubtitleTrack,
} from '../player/engine';
import { pickDefaultAudioTrack, pickDefaultSubtitleTrack } from '../player/track-prefs';
import type { TrackSnapshot } from '../player/tracks';
import { PLAYER_ACTIVE } from './player';
import { PLAYER_AUDIO_TRACKS, PLAYER_SUBTITLE_TRACKS, PLAYER_TRACK_MENU, TRACK_LIST_CAP, type TrackMenu } from './player-tracks';
import type { ActiveChannelSnapshot } from './records';
import { SETTINGS_AUDIO_LANGUAGE, SETTINGS_LIVE_COUNTRY, SETTINGS_SUBTITLE_LANGUAGE } from './settings';
import { resolveSubtitleLanguage } from './subtitle-language';
import { get, set } from './typed';

/**
 * Dock/theater audio/subtitle track menus: toggle actions, track selection,
 * and `registerTrackSync()` — the engine wiring that keeps `player.
 * audioTracks`/`player.subtitleTracks` fresh and applies the viewer's
 * language preferences once per stream. Split from `player-tracks.ts` (the
 * key/type module) the same way every other module here pairs state with
 * actions.
 */

/**
 * The track-control surface this module needs from `src/player/engine.ts`
 * — `engine.ts`'s own doc says a state/UI layer should import its dispatch
 * functions directly, and `registerTrackSync()` does exactly that by
 * default. The interface exists only so a spec can substitute a fake
 * (`registerTrackSync(fakeAccess)`) without a real hls.js/mpegts.js/native
 * attach — mirroring how `src/core/platform/fake-platform.ts` lets specs
 * swap the platform layer instead of hitting real storage/network.
 */
export interface TrackEngineAccess {
    getPlayerTracks(): TrackSnapshot;
    setAudioTrack(id: string): void;
    setSubtitleTrack(id: string | null): void;
    onTracksChanged(cb: () => void): void;
}

const REAL_ENGINE_ACCESS: TrackEngineAccess = {
    getPlayerTracks: engineGetPlayerTracks,
    setAudioTrack: engineSetAudioTrack,
    setSubtitleTrack: engineSetSubtitleTrack,
    onTracksChanged: engineOnTracksChanged,
};

let engineAccess: TrackEngineAccess = REAL_ENGINE_ACCESS;

/**
 * The `player.active` identity (`id::streamUrl`) defaults have already been
 * auto-applied for — `null` before the first stream, or once playback
 * stops. Combining both fields (not `id` alone) matters because switching a
 * channel's *variant* (`live/playVariant`) deliberately keeps the row's id
 * but hands the engine a new `streamUrl` and genuinely re-attaches — see
 * `applyLanguageDefaultsOnce()`'s doc.
 */
let autoAppliedStreamKey: string | null = null;

function streamKeyOf(active: ActiveChannelSnapshot | null | undefined): string | null {
    if (!active) return null;
    return `${active.id}::${active.streamUrl}`;
}

export function registerPlayerTrackActions(): void {
    defineFn('player/toggleAudioMenu', () => {
        toggleAudioMenu();
    });
    defineFn('player/toggleSubtitleMenu', () => {
        toggleSubtitleMenu();
    });
    defineFn('player/toggleVisualizerMenu', () => {
        toggleVisualizerMenu();
    });
    defineFn('player/closeTrackMenu', () => {
        closeTrackMenu();
    });
    defineFn('player/handleTrackMenuKeydown', (_el, _state, _delta, _value, event) => {
        handleTrackMenuKeydown(event as KeyboardEvent | undefined);
    });
    // The `value` a data-fn dispatch carries is coerced by Spektrum itself
    // (src/state/README.md's testing section) — a numeric-looking track id
    // ("0", "1", … — exactly what every engine's index-based id looks like,
    // see hls-tracks.ts/native-tracks.ts) arrives as a `number`, not a
    // `string`. `trackIdFromValue()` normalizes it back before it is
    // compared against `MediaTrack.id`.
    defineFn('player/setAudioTrack', (_el, _state, _delta, value: unknown) => {
        const id = trackIdFromValue(value);
        if (id !== null) setAudioTrack(id);
    });
    defineFn('player/setSubtitleTrack', (_el, _state, _delta, value: unknown) => {
        const id = trackIdFromValue(value);
        if (id !== null) setSubtitleTrack(id);
    });
}

/** Narrows a `data-fn` dispatch's coerced `value` (string/number/boolean — Spektrum's own coercion never produces anything else) to a track id string, or `null` for anything not carrying one. */
function trackIdFromValue(value: unknown): string | null {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return null;
}

export function toggleAudioMenu(): void {
    toggleMenu('audio');
}

export function toggleSubtitleMenu(): void {
    toggleMenu('subtitles');
}

/** Radio's visualizer-preset picker — the same dock popup, minus the `publishTrackLists()` step (its options are a fixed catalog, not an engine snapshot). */
export function toggleVisualizerMenu(): void {
    toggleMenu('visualizer');
}

/** Each menu closes the others; opening a track menu re-reads `getPlayerTracks()` so a menu opened once, closed, and reopened later never shows a stale snapshot. */
function toggleMenu(menu: Exclude<TrackMenu, 'none'>): void {
    const isOpen = get<TrackMenu>(PLAYER_TRACK_MENU) === menu;
    if (isOpen) {
        set(PLAYER_TRACK_MENU, 'none');
        return;
    }
    if (menu !== 'visualizer') publishTrackLists();
    set(PLAYER_TRACK_MENU, menu);
    // Move focus into the dialog once it's mounted — the trigger button's
    // own click handler hasn't returned yet, so `data-if`'s DOM insert
    // needs a tick before `refs` resolves the new element.
    queueMicrotask(() => focusTrackMenuDialog(menu));
}

/** The modal's Escape-to-close/backdrop-click-to-close entry point, also wired to the backdrop's own click handler. */
export function closeTrackMenu(): void {
    set(PLAYER_TRACK_MENU, 'none');
}

const MENU_REFS: Record<Exclude<TrackMenu, 'none'>, string> = {
    audio: 'audioTrackMenu',
    subtitles: 'subtitleTrackMenu',
    visualizer: 'visualizerPresetMenu',
};

function trackMenuRef(menu: Exclude<TrackMenu, 'none'>): HTMLElement | undefined {
    const ref = refs[MENU_REFS[menu]];
    return ref instanceof HTMLElement ? ref : undefined;
}

function focusTrackMenuDialog(menu: Exclude<TrackMenu, 'none'>): void {
    const dialog = trackMenuRef(menu);
    if (!dialog) return;
    const firstItem = dialog.querySelector<HTMLElement>('.track-menu__item');
    (firstItem ?? dialog).focus();
}

/**
 * Escape closes the dialog and returns focus to nothing in particular (the
 * trigger button re-gains focus naturally — it's still the last element the
 * browser had focused before the dialog stole it). Arrow Up/Down roves focus
 * between `.track-menu__item` buttons, wrapping at each end, so the dialog
 * is fully usable without a pointer — the "keyboard navigatable" ask.
 */
function handleTrackMenuKeydown(event: KeyboardEvent | undefined): void {
    if (!event) return;
    const menu = get<TrackMenu>(PLAYER_TRACK_MENU);
    if (menu === undefined || menu === 'none') return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeTrackMenu();
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const dialog = trackMenuRef(menu);
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('.track-menu__item'));
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
    items[next]?.focus();
}

/** `id`: a `MediaTrack.id` from `player.audioTracks`. Applies through the engine, republishes so the menu's active flag updates, then closes the menu — the pick is done. */
export function setAudioTrack(id: string): void {
    engineAccess.setAudioTrack(id);
    publishTrackLists();
    set(PLAYER_TRACK_MENU, 'none');
}

/** `idOrOff`: a `MediaTrack.id` from `player.subtitleTracks`, or the literal `'off'` sentinel (the menu's fixed top row) — `'off'` turns subtitles off via `engine.setSubtitleTrack(null)`. */
export function setSubtitleTrack(idOrOff: string): void {
    engineAccess.setSubtitleTrack(idOrOff === 'off' ? null : idOrOff);
    publishTrackLists();
    set(PLAYER_TRACK_MENU, 'none');
}

function publishTrackLists(): void {
    const snapshot = engineAccess.getPlayerTracks();
    set(PLAYER_AUDIO_TRACKS, snapshot.audio.slice(0, TRACK_LIST_CAP));
    set(PLAYER_SUBTITLE_TRACKS, snapshot.subtitles.slice(0, TRACK_LIST_CAP));
}

/**
 * Wires the dock/theater track menus to the real playback engine — called
 * once from `bootstrap.ts`, alongside `registerPlayerBindings()` (the app's
 * existing player-registration point). `access` defaults to the real
 * `src/player/engine.ts` dispatch surface; specs pass a fake instead of
 * driving a real hls.js/mpegts.js/native attach.
 *
 * Two independent subscriptions:
 *  - `watch([PLAYER_ACTIVE])` resets the menu and clears both lists the
 *    instant the channel/stream changes — synchronously, before the new
 *    engine's tracks have even arrived, so a stale menu never lingers over
 *    a channel it no longer describes.
 *  - `engineAccess.onTracksChanged()` republishes the lists on every real
 *    track update (initial attach, a later manifest update, a chain
 *    fallback), then applies the viewer's language preferences exactly
 *    once per stream — see `applyLanguageDefaultsOnce()`.
 */
export function registerTrackSync(access: TrackEngineAccess = REAL_ENGINE_ACCESS): () => void {
    engineAccess = access;

    const unwatchActive = watch([PLAYER_ACTIVE], (state: unknown) => {
        const active = (state as { player?: { active?: ActiveChannelSnapshot | null } }).player?.active;
        set(PLAYER_TRACK_MENU, 'none');
        set(PLAYER_AUDIO_TRACKS, []);
        set(PLAYER_SUBTITLE_TRACKS, []);
        if (!active) autoAppliedStreamKey = null;
    });

    engineAccess.onTracksChanged(() => {
        publishTrackLists();
        applyLanguageDefaultsOnce();
    });

    return () => {
        unwatchActive();
    };
}

/**
 * Applies `settings.audioLanguage`/`settings.subtitleLanguage` exactly once
 * per stream (`streamKeyOf()`'s identity) — a late-arriving track update for
 * the *same* stream (a second `onTracksChanged` firing) never re-applies,
 * so it can never stomp a manual pick the viewer already made through the
 * menu. Zapping to a genuinely new stream (a new row id, or the same
 * channel's `live/playVariant` swap to a new `streamUrl`) always re-applies,
 * since the key changes. Only calls the engine setter when its pick differs
 * from what is already active, matching `track-prefs.ts`'s "leave whatever
 * the engine already selected alone rather than guessing further".
 */
function applyLanguageDefaultsOnce(): void {
    const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE) ?? null;
    const key = streamKeyOf(active);
    if (!key || key === autoAppliedStreamKey) return;
    autoAppliedStreamKey = key;

    const snapshot = engineAccess.getPlayerTracks();
    const audioLang = get<string>(SETTINGS_AUDIO_LANGUAGE) ?? 'en';
    const subtitleSetting = get<string>(SETTINGS_SUBTITLE_LANGUAGE) ?? 'auto';
    const liveCountry = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';

    const audioPick = pickDefaultAudioTrack(snapshot.audio, audioLang);
    const activeAudio = snapshot.audio.find((track) => track.active) ?? null;
    if (audioPick && audioPick.id !== activeAudio?.id) {
        engineAccess.setAudioTrack(audioPick.id);
    }

    const resolvedSubtitleLang = resolveSubtitleLanguage(subtitleSetting, liveCountry);
    const subtitlePick = pickDefaultSubtitleTrack(snapshot.subtitles, resolvedSubtitleLang);
    const activeSubtitle = snapshot.subtitles.find((track) => track.active) ?? null;
    if ((subtitlePick?.id ?? null) !== (activeSubtitle?.id ?? null)) {
        engineAccess.setSubtitleTrack(subtitlePick?.id ?? null);
    }

    publishTrackLists();
}

/** Test-only reset, same convention as `engine.ts`'s `resetPlayerEngineForTests()`. @internal */
export function resetPlayerTracksForTests(): void {
    engineAccess = REAL_ENGINE_ACCESS;
    autoAppliedStreamKey = null;
}
