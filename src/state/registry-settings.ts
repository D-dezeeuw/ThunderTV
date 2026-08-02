import type { KeyMeta } from './registry';
import { SETTINGS_HIDE_NO_AUDIO_TITLES } from './settings';

/**
 * `KEY_REGISTRY`'s newer settings entries. A third split file for the same
 * reason as `registry-player.ts` and `registry-epg.ts`: `registry-keys.ts`
 * and `registry-overflow.ts` are both *on* the 400-line hard ceiling, so the
 * next settings key has nowhere to go but here.
 */
export const SETTINGS_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    [SETTINGS_HIDE_NO_AUDIO_TITLES]: {
        owner: 'settings',
        persisted: true,
        description:
            'Hide Movies/TV Shows titles this device already proved come out silent (src/player/no-audio-marks.ts). Off by default: filtering on evidence the viewer cannot see is worse than badging.',
    },
};
