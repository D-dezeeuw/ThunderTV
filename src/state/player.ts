import { setValue } from 'spektrum';
import type { ChannelVariant } from '../m3u/types';
import type { ActiveChannelSnapshot } from './records';

/** Feature 05.1.2: dotted, module-prefixed key constants — no string literals at call sites. */
export const PLAYER_ACTIVE = 'player.active';
export const PLAYER_ZAP_HISTORY = 'player.zapHistory';
/** Transient, session-only: the last fatal playback failure's technical detail, rendered in the player bar so a phone user can report *why* a stream died without devtools. */
export const PLAYER_PLAYBACK_ERROR = 'player.playbackError';
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

/** Feature 05.5.3: capped at 20 entries; the Recent view (Phase 13) may trim its own display further. */
export const ZAP_HISTORY_CAP = 20;

/** A channel rarely has more than a handful of feeds; this ceiling only exists so a pathological provider cannot flood the dock. */
export const VARIANTS_CAP = 12;

export interface PlayerState {
    active: ActiveChannelSnapshot | null;
    zapHistory: ActiveChannelSnapshot[];
    playbackError: string | null;
    streamHealth: string | null;
    variants: ChannelVariant[];
    activeVariantId: string | null;
}

export const PLAYER_DEFAULTS: PlayerState = {
    active: null,
    zapHistory: [],
    playbackError: null,
    streamHealth: null,
    variants: [],
    activeVariantId: null,
};

/** Seeds this module's defaults — called once from `state/index.ts`'s `initState()`, before rehydration can overwrite it (Feature 05.1.8). */
export function initPlayerState(): void {
    setValue(PLAYER_ACTIVE, PLAYER_DEFAULTS.active);
    setValue(PLAYER_ZAP_HISTORY, PLAYER_DEFAULTS.zapHistory);
    setValue(PLAYER_PLAYBACK_ERROR, PLAYER_DEFAULTS.playbackError);
    setValue(PLAYER_STREAM_HEALTH, PLAYER_DEFAULTS.streamHealth);
    setValue(PLAYER_VARIANTS, PLAYER_DEFAULTS.variants);
    setValue(PLAYER_ACTIVE_VARIANT_ID, PLAYER_DEFAULTS.activeVariantId);
}
