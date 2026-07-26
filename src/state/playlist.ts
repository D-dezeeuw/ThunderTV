import { setValue } from 'spektrum';
import type { PlaylistType } from '../core/storage';

export const PLAYLIST_SOURCES = 'playlist.sources';
export const PLAYLIST_ACTIVE_SOURCE_ID = 'playlist.activeSourceId';
export const PLAYLIST_DEMO_ROWS = 'playlist.demoRows';

/** Registry `maxItems` ceiling for `playlist.sources` (Feature 05.8.5) — a real, generous bound (way more playlists than any real user imports), not the generic 1000-item bulk-data default. */
export const MAX_PLAYLIST_SOURCES = 200;

/**
 * The real Phase 07 shape (`playlist.sources`/`activeSourceId`) that
 * Phase 05 deferred — a denormalized *summary* of each imported source
 * (counts and meta only, never channel rows, per masterplan §5.4/§5.8).
 * Field-for-field a subset of `PlaylistRecord` (`src/core/storage/records.ts`)
 * with Xtream-only `username`/`password` deliberately omitted — those never
 * belong in Spektrum state (Phase 19 decides how Xtream credentials are
 * held once that source type is real).
 */
export interface PlaylistSourceSummary {
    id: string;
    type: PlaylistType;
    name: string;
    url: string | null;
    channelCount: number;
    groupCount: number;
    radioCount: number;
    drmCount: number;
    skipped: number;
    importDate: number;
    lastRefresh: number | null;
    needsReupload: boolean;
}

export interface PlaylistState {
    sources: PlaylistSourceSummary[];
    activeSourceId: string | null;
    demoRows: readonly string[];
}

const DEMO_ROWS = [
    'Sample Channel One',
    'Sample Channel Two',
    'Sample Channel Three',
    'Sample Channel Four',
] as const;

export const PLAYLIST_DEFAULTS: PlaylistState = {
    sources: [],
    activeSourceId: null,
    demoRows: DEMO_ROWS,
};

export function initPlaylistState(): void {
    setValue(PLAYLIST_SOURCES, PLAYLIST_DEFAULTS.sources);
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_DEFAULTS.activeSourceId);
    setValue(PLAYLIST_DEMO_ROWS, PLAYLIST_DEFAULTS.demoRows);
}
