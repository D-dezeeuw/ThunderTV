import { setValue } from 'spektrum';
import type { MediaTrack } from '../player/tracks';

/**
 * Track-menu state (final audio/subtitle-track stage): the dock/theater
 * popup menus' own published lists and which one (if any) is open. Split
 * from `player.ts` rather than added there since these three keys have a
 * distinct lifecycle (rebuilt from `getPlayerTracks()` on every menu open
 * and every engine track-changed event, reset on every stream change) —
 * `player-tracks.actions.ts` is the only writer, mirroring the
 * state/action file-pair convention every other module here uses.
 *
 * Radio's visualizer-preset picker rides on the same key (`'visualizer'`)
 * even though it publishes no track list: it is the same dock popup with
 * the same open/close/keyboard/Back semantics, and one "which popup is
 * open" value is what guarantees two of them can never be open at once.
 */
export const PLAYER_AUDIO_TRACKS = 'player.audioTracks';
export const PLAYER_SUBTITLE_TRACKS = 'player.subtitleTracks';
export const PLAYER_TRACK_MENU = 'player.trackMenu';

/** A stream rarely offers more than a handful of dubs/subtitle languages; this ceiling only exists so a pathological provider cannot flood the popup (mirrors `player.ts`'s `VARIANTS_CAP` reasoning). */
export const TRACK_LIST_CAP = 50;

export type TrackMenu = 'none' | 'audio' | 'subtitles' | 'visualizer';

export interface PlayerTracksState {
    audioTracks: MediaTrack[];
    subtitleTracks: MediaTrack[];
    trackMenu: TrackMenu;
}

export const PLAYER_TRACKS_DEFAULTS: PlayerTracksState = {
    audioTracks: [],
    subtitleTracks: [],
    trackMenu: 'none',
};

/** Seeds this module's defaults — called once from `state/index.ts`'s `initState()`, before rehydration (neither key persists, so there is nothing to overwrite anyway). */
export function initPlayerTracksState(): void {
    setValue(PLAYER_AUDIO_TRACKS, PLAYER_TRACKS_DEFAULTS.audioTracks);
    setValue(PLAYER_SUBTITLE_TRACKS, PLAYER_TRACKS_DEFAULTS.subtitleTracks);
    setValue(PLAYER_TRACK_MENU, PLAYER_TRACKS_DEFAULTS.trackMenu);
}
