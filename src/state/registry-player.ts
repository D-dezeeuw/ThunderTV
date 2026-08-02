import { PLAYER_PLAYBACK_ERROR, PLAYER_PLAYBACK_NOTICE, PLAYER_STREAM_HEALTH } from './player';
import type { KeyMeta } from './registry';
import { PLAYER_SUBTITLE_SEARCH } from './subtitle-search';

/**
 * `KEY_REGISTRY`'s player-diagnostics entries — the three transient keys the
 * player bar renders about *how* the current stream is doing, as opposed to
 * what is playing. Split by owner the way `registry-epg.ts` did (and for the
 * same reason: `registry-keys.ts` and `registry-overflow.ts` both sit on the
 * 400-line `max-lines` ceiling), so the next player key has an obvious home.
 */
export const PLAYER_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    [PLAYER_STREAM_HEALTH]: {
        owner: 'player',
        persisted: false,
        description:
            'Live stream quality (good/fair/poor) derived from stall frequency — the player-bar signal indicator; null when idle.',
    },
    [PLAYER_PLAYBACK_ERROR]: {
        owner: 'player',
        persisted: false,
        description:
            'Transient diagnostics: the last fatal playback failure (hls.js fatal kind or MediaError label), rendered in the player bar — cleared on every new attach/stop.',
    },
    [PLAYER_PLAYBACK_NOTICE]: {
        owner: 'player',
        persisted: false,
        description:
            'Transient: a stream that plays but is missing something — today only "the picture runs, no audio is being decoded" (src/player/audio-output.ts), which is what an AC-3/E-AC-3/DTS movie looks like in a browser. Separate from playbackError because nothing failed: the title is watchable, and the bar says so in its own words rather than in red.',
    },
    [PLAYER_SUBTITLE_SEARCH]: {
        owner: 'player',
        persisted: false,
        description:
            'Transient: the subtitle menu\'s "search online" panel — status, one message, and the pickable results (src/core/subtitles/). Cleared on every stream change. No maxItems: the value is an object, which the bulk guard does not inspect; subtitle-search.run.ts slices to SUBTITLE_RESULTS_CAP.',
    },
};
