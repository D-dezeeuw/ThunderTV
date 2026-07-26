import { makeSourceKey } from '../core/connect/source-key';
import { getPlatform } from '../core/platform';
import type { GroupRecord, PlaylistRecord, PlaylistType } from '../core/storage';
import type { ParseSummary } from './parser-client';

export interface CommitFields {
    stagingId: string;
    type: PlaylistType;
    url: string | undefined;
    name: string;
    summary: ParseSummary;
    etag: string | null;
    lastModified: string | null;
    contentFingerprint: string | null;
}

/** The one place that knows a source's identity key — used by both lookup and the pipeline's dedupe warning (Feature 07.7.1). */
export function sourceKeyFor(type: PlaylistType, url: string | undefined): string | null {
    return makeSourceKey(type, url);
}

/** Full-table scan — realistic playlist counts are a handful per user, never worth a secondary index (Feature 07.7.3). */
export async function findExistingByKey(key: string | null): Promise<PlaylistRecord | undefined> {
    if (!key) return undefined;
    const all = await getPlatform().storage.getAll('playlists');
    return all.find((p) => sourceKeyFor(p.type, p.url) === key);
}

/** Same-shape lookup for the file/paste fingerprint warning (Feature 07.7.6) — only ever matches other file/paste sources, since URL sources carry no fingerprint. */
export async function findExistingByFingerprint(fingerprint: string): Promise<PlaylistRecord | undefined> {
    const all = await getPlatform().storage.getAll('playlists');
    return all.find((p) => p.contentFingerprint === fingerprint);
}

/**
 * Write-then-swap commit (Feature 07.7.4): the new rows already live under
 * `stagingId` (the worker wrote them there directly — no separate staging
 * area to move out of). Committing is: persist the new `PlaylistRecord`
 * pointing at `stagingId`, then — only on a genuine upsert — delete the
 * superseded record and its rows. A crash between these two steps leaves
 * two full, independently-browsable playlist versions rather than a
 * half-empty one; the boot-time sweep (Feature 07.9.7) cleans up the loser
 * if the delete step never got to run.
 */
export async function commitImport(fields: CommitFields, existing: PlaylistRecord | undefined): Promise<PlaylistRecord> {
    const storage = getPlatform().storage;
    const now = Date.now();

    const groupRows: GroupRecord[] = fields.summary.groups.map((g) => ({
        playlistId: fields.stagingId,
        name: g.name,
        channelCount: g.count,
        firstIndex: g.firstIndex,
    }));
    await storage.bulkPut('groups', groupRows, (r) => [r.playlistId, r.name]);

    const record: PlaylistRecord = {
        v: 1,
        id: fields.stagingId,
        type: fields.type,
        name: fields.name,
        ...(fields.url !== undefined ? { url: fields.url } : {}),
        channelCount: fields.summary.total,
        groupCount: fields.summary.groups.length,
        radioCount: fields.summary.radioCount,
        drmCount: fields.summary.drmCount,
        skipped: fields.summary.skipped,
        importDate: existing?.importDate ?? now,
        lastRefresh: now,
        etag: fields.etag,
        lastModified: fields.lastModified,
        contentFingerprint: fields.contentFingerprint,
    };
    await storage.bulkPut('playlists', [record], (r) => r.id);

    if (existing && existing.id !== fields.stagingId) {
        await storage.deleteByPlaylistId('channels', existing.id);
        await storage.deleteByPlaylistId('groups', existing.id);
        await storage.deleteRow('playlists', existing.id);
    }

    return record;
}

/** Deletes a staging import's rows without ever having written a `PlaylistRecord` for it — the cancel/error path (Feature 07.9.3/07.9.5). */
export async function cleanupStaging(stagingId: string): Promise<void> {
    const storage = getPlatform().storage;
    await storage.deleteByPlaylistId('channels', stagingId);
    await storage.deleteByPlaylistId('groups', stagingId);
}
