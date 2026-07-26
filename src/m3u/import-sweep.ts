import { getPlatform } from '../core/platform';

/**
 * Boot-time orphan sweep (Feature 07.9.7) — crash recovery for a process
 * that died between the worker's chunk writes and `commitImport()`'s
 * `PlaylistRecord` write. Every import mints a fresh `crypto.randomUUID()`
 * staging id (Feature 07.9.3), so an orphaned row's `playlistId` can never
 * collide with a future legitimate one — it is always safe to delete.
 *
 * Cost note: this reads every `channels`/`groups` row once, at boot, to
 * collect the live `playlistId` set — no cheaper query exists without a
 * secondary index this schema doesn't have. Bounded, one-time cost at
 * realistic library sizes (Phase 06's benchmark: ~1s for 100k rows);
 * Phase 26 (Performance Hardening) owns tuning this further if it ever
 * shows up as a real boot-time cost.
 */
export async function sweepOrphanedPlaylistRows(): Promise<{ channels: number; groups: number }> {
    const storage = getPlatform().storage;
    const [playlists, channels, groups] = await Promise.all([
        storage.getAll('playlists'),
        storage.getAll('channels'),
        storage.getAll('groups'),
    ]);

    const knownIds = new Set(playlists.map((p) => p.id));
    const orphanedChannelIds = distinctOrphanIds(channels, knownIds);
    const orphanedGroupIds = distinctOrphanIds(groups, knownIds);

    for (const id of orphanedChannelIds) await storage.deleteByPlaylistId('channels', id);
    for (const id of orphanedGroupIds) await storage.deleteByPlaylistId('groups', id);

    return { channels: orphanedChannelIds.size, groups: orphanedGroupIds.size };
}

function distinctOrphanIds(rows: readonly { playlistId: string }[], knownIds: ReadonlySet<string>): Set<string> {
    const orphans = new Set<string>();
    for (const row of rows) {
        if (!knownIds.has(row.playlistId)) orphans.add(row.playlistId);
    }
    return orphans;
}
