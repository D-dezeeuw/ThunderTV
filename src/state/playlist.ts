import { setValue } from 'spektrum';

export const PLAYLIST_SOURCE_COUNT = 'playlist.sourceCount';
export const PLAYLIST_DEMO_ROWS = 'playlist.demoRows';
export const PLAYLIST_LAST_PICKED_LABEL = 'playlist.lastPickedLabel';

/**
 * Deliberately *not* the channel rows themselves (masterplan §5.4) — those
 * live in module memory (`src/state/bulk-policy.ts`'s stance, `src/m3u/`
 * once Phase 06 lands), never Spektrum state. `playlist.sources`/
 * `activeSourceId`/`importProgress` (the real Phase 07 shape) don't exist
 * yet; the three keys below are the Phase 01-03 stub/demo state they'll
 * eventually replace.
 */
export interface PlaylistState {
    sourceCount: number;
    demoRows: readonly string[];
    lastPickedLabel: string | null;
}

const DEMO_ROWS = [
    'Sample Channel One',
    'Sample Channel Two',
    'Sample Channel Three',
    'Sample Channel Four',
] as const;

export const PLAYLIST_DEFAULTS: PlaylistState = {
    sourceCount: 0,
    demoRows: DEMO_ROWS,
    lastPickedLabel: null,
};

export function initPlaylistState(): void {
    setValue(PLAYLIST_SOURCE_COUNT, PLAYLIST_DEFAULTS.sourceCount);
    setValue(PLAYLIST_DEMO_ROWS, PLAYLIST_DEFAULTS.demoRows);
    setValue(PLAYLIST_LAST_PICKED_LABEL, PLAYLIST_DEFAULTS.lastPickedLabel);
}
