import { setValue } from 'spektrum';
import type { ChannelVariant } from '../m3u/types';
import type { ActiveChannelSnapshot } from './records';

/** Feature 05.1.2: dotted, module-prefixed key constants — no string literals at call sites. */
export const PLAYER_ACTIVE = 'player.active';
export const PLAYER_ZAP_HISTORY = 'player.zapHistory';
/** Transient, session-only: the last fatal playback failure's technical detail, rendered in the player bar so a phone user can report *why* a stream died without devtools. */
export const PLAYER_PLAYBACK_ERROR = 'player.playbackError';
/**
 * Transient, session-only: a stream that *plays* but is missing something —
 * today only "the picture is running and no audio is being decoded", which
 * `src/player/audio-output.ts` detects from the element's own decoder
 * counters. Deliberately not `playbackError`: nothing failed, the title is
 * watchable, and a red "Playback failed:" over a perfectly good picture
 * would be a lie. Cleared on every new attach/stop like its neighbour.
 */
export const PLAYER_PLAYBACK_NOTICE = 'player.playbackNotice';
/** Transient: live stream quality ('good' | 'fair' | 'poor'), from stall frequency — the player-bar signal indicator. Null when nothing is playing. */
export const PLAYER_STREAM_HEALTH = 'player.streamHealth';
/**
 * The playing channel's alternate feeds — other qualities, a provider
 * bundle's own copy, the catch-up stream — taken from its grouped Live row
 * and rendered as the dock's variant strip. Derived from the loaded
 * catalog, so deliberately never persisted: it is rebuilt whenever a
 * channel starts, and a stale copy would offer stream ids the provider may
 * already have rotated.
 */
export const PLAYER_VARIANTS = 'player.variants';
/** Id of the variant currently playing, so the strip can mark one chip active. */
export const PLAYER_ACTIVE_VARIANT_ID = 'player.activeVariantId';
/**
 * The listener's Radio visualizer preference: `'auto'`
 * (`src/player/visualizer/index.ts` cycles through every preset) or a
 * specific preset id, which pins to that look until switched back to
 * `'auto'`. The default is `'classical'` — out of the box Radio opens on one
 * settled look rather than rotating through ten, and the picker's first row
 * is always there to turn the rotation on. No audio analysis ever picks
 * this — the listener does, via the picker in the player bar (`index.html`'s
 * `radio-visualizer-btn` and the menu it opens; options from
 * `player.selectors.ts`'s `VISUALIZER_PICKER_OPTIONS`).
 */
export const PLAYER_VISUALIZER_PRESET = 'player.visualizerPreset';
/** Transient, session-only: whether the listener paused the Radio visualizer's render loop. Never persisted — reopening Radio always starts unpaused. */
export const PLAYER_VISUALIZER_PAUSED = 'player.visualizerPaused';
/**
 * "Play this TV channel like a radio station": collapse the picture and put
 * the visualizer up instead. Persisted, because it is a viewing preference
 * (a TV used as a stereo stays that way between sessions), not a per-channel
 * accident — and the player bar always carries the switch back.
 * Radio ignores this key entirely: it has no picture to give up.
 */
export const PLAYER_AUDIO_MODE = 'player.audioMode';
/**
 * Transient, session-only: whether the viewer paused playback via the
 * Stop/Play toggle without closing the channel. `player.active` stays set —
 * only the media element itself is paused — so the channel/episode remains
 * selected and playback resumes from where it left off on the next press.
 */
export const PLAYER_PAUSED = 'player.paused';

/**
 * Should the visualizer pane stand in for the picture right now? True for
 * Radio always, and for a TV channel-list view whenever the viewer asked for
 * audio-only. Pure, so the selector (`player.selectors.ts`), the fullscreen
 * action (`player.actions.ts`) and the visualizer watch
 * (`src/player/bindings.ts`) all decide this the same way instead of each
 * spelling out its own route comparison.
 */
export function isAudioVisual(view: string | null | undefined, audioMode: boolean): boolean {
    if (view === 'radio') return true;
    if (view === 'live' || view === 'categories') return audioMode;
    return false;
}

/** Feature 05.5.3: capped at 20 entries; the Recent view (Phase 13) may trim its own display further. */
export const ZAP_HISTORY_CAP = 20;

/** A channel rarely has more than a handful of feeds; this ceiling only exists so a pathological provider cannot flood the dock. */
export const VARIANTS_CAP = 12;

export interface PlayerState {
    active: ActiveChannelSnapshot | null;
    zapHistory: ActiveChannelSnapshot[];
    playbackError: string | null;
    playbackNotice: string | null;
    streamHealth: string | null;
    variants: ChannelVariant[];
    activeVariantId: string | null;
    visualizerPreset: string;
    visualizerPaused: boolean;
    audioMode: boolean;
    paused: boolean;
}

export const PLAYER_DEFAULTS: PlayerState = {
    active: null,
    zapHistory: [],
    playbackError: null,
    playbackNotice: null,
    streamHealth: null,
    variants: [],
    activeVariantId: null,
    visualizerPreset: 'classical',
    visualizerPaused: false,
    audioMode: false,
    paused: false,
};

/** Seeds this module's defaults — called once from `state/index.ts`'s `initState()`, before rehydration can overwrite it (Feature 05.1.8). */
export function initPlayerState(): void {
    setValue(PLAYER_ACTIVE, PLAYER_DEFAULTS.active);
    setValue(PLAYER_ZAP_HISTORY, PLAYER_DEFAULTS.zapHistory);
    setValue(PLAYER_PLAYBACK_ERROR, PLAYER_DEFAULTS.playbackError);
    setValue(PLAYER_PLAYBACK_NOTICE, PLAYER_DEFAULTS.playbackNotice);
    setValue(PLAYER_STREAM_HEALTH, PLAYER_DEFAULTS.streamHealth);
    setValue(PLAYER_VARIANTS, PLAYER_DEFAULTS.variants);
    setValue(PLAYER_ACTIVE_VARIANT_ID, PLAYER_DEFAULTS.activeVariantId);
    setValue(PLAYER_VISUALIZER_PRESET, PLAYER_DEFAULTS.visualizerPreset);
    setValue(PLAYER_VISUALIZER_PAUSED, PLAYER_DEFAULTS.visualizerPaused);
    setValue(PLAYER_AUDIO_MODE, PLAYER_DEFAULTS.audioMode);
    setValue(PLAYER_PAUSED, PLAYER_DEFAULTS.paused);
}
