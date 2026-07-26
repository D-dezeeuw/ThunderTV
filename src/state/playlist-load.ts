import { getPlatform } from '../core/platform';
import type { PlaylistRecord } from '../core/storage';
import { PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { set } from './typed';

/**
 * Builds `playlist.sources` from the real `playlists` storage table —
 * `playlist.sources` is a live projection, never itself persisted through
 * the Phase 05 bridge, so there is exactly one source of truth (Feature
 * 07.1.8's "sources list" replacement for the pre-Phase-07 stub). Called
 * once at boot (`bootstrap.ts`'s `loadActiveSource()`, now real) and again
 * after every successful import commit.
 */
export async function loadPlaylistSources(): Promise<void> {
    const storage = getPlatform().storage;
    const records = await storage.getAll('playlists');
    set(
        PLAYLIST_SOURCES,
        records.map((r) => toSummary(r, storage.tier)),
    );
}

function toSummary(record: PlaylistRecord, tier: 'full' | 'partial' | 'none'): PlaylistSourceSummary {
    return {
        id: record.id,
        type: record.type,
        name: record.name,
        url: record.url ?? null,
        channelCount: record.channelCount,
        groupCount: record.groupCount,
        radioCount: record.radioCount,
        drmCount: record.drmCount,
        skipped: record.skipped,
        importDate: record.importDate,
        lastRefresh: record.lastRefresh,
        needsReupload: needsReupload(record, tier),
    };
}

/**
 * `m3u-file`/`m3u-text` rows only ever land in a table the current tier
 * actually persists across reloads (Feature 04.5.2: `channels`/`groups`
 * are never in `LocalStorageStorage`'s `PERSISTED_TABLES`, and `none`
 * persists nothing at all) — so on any non-`full` tier, a fresh boot's
 * `channels` table is *structurally* empty for these two source types
 * regardless of how many rows `channelCount` claims. No row-count query
 * needed: the tier alone answers it, and never goes stale the way a
 * *stored* `needsReupload` flag would (see `records.ts`'s note).
 */
function needsReupload(record: PlaylistRecord, tier: 'full' | 'partial' | 'none'): boolean {
    if (tier === 'full') return false;
    if (record.type !== 'm3u-file' && record.type !== 'm3u-text') return false;
    return record.channelCount > 0;
}
