import { getPlatform } from '../core/platform';
import type { ChannelRecord, GroupRecord, PlaylistRecord } from '../core/storage';
import { makeSourceKey } from '../core/connect/source-key';
import { UNGROUPED, type ChannelRow, type GroupMeta } from '../m3u/types';
import { authenticate, getLiveCategories, getLiveStreams } from './client';
import type { XtreamError } from './errors';
import { sortCategoriesNlFirst } from './nl-priority';
import type { XtreamCategory, XtreamLiveStream, XtreamSource } from './types';
import { liveStreamUrl } from './urls';

export interface XtreamImportParams {
    url: string;
    user: string;
    pass: string;
    name: string;
}

export interface XtreamImportSummary {
    sourceId: string;
    total: number;
    groupCount: number;
    skipped: number;
    updated: boolean;
}

export type XtreamImportOutcome = { ok: true; summary: XtreamImportSummary } | { ok: false; error: XtreamError };

/**
 * The Xtream MVP import orchestration: authenticate, fetch categories +
 * live streams (one unfiltered call — Feature 19.2.7's quirk, avoids an
 * N-category request storm), sort categories Dutch-first so both the flat
 * list and the group view reflect the priority, then write through the
 * exact same `channels`/`groups`/`playlists` tables the M3U pipeline uses
 * (`src/m3u/list-load.ts` and Phase 08's list UI are format-agnostic — they
 * read from storage, not from any M3U-specific machinery).
 */
export async function importXtreamSource(params: XtreamImportParams): Promise<XtreamImportOutcome> {
    const source: XtreamSource = { url: params.url, user: params.user, pass: params.pass };

    const auth = await authenticate(source);
    if (!auth.ok) return { ok: false, error: auth.error };

    const categoriesResult = await getLiveCategories(source);
    if (!categoriesResult.ok) return { ok: false, error: categoriesResult.error };

    const streamsResult = await getLiveStreams(source);
    if (!streamsResult.ok) return { ok: false, error: streamsResult.error };

    const orderedCategories = sortCategoriesNlFirst(categoriesResult.data);
    const { rows, groups } = buildRows(source, orderedCategories, streamsResult.data);

    const stagingId = crypto.randomUUID();
    const storage = getPlatform().storage;

    const records: ChannelRecord[] = rows.map((row, index) => toChannelRecord(row, stagingId, index));
    if (records.length > 0) {
        await storage.bulkPut('channels', records, (r) => [r.playlistId, r.index]);
    }

    const groupRows: GroupRecord[] = groups.map((g) => ({
        playlistId: stagingId,
        name: g.name,
        channelCount: g.count,
        firstIndex: g.firstIndex,
    }));
    await storage.bulkPut('groups', groupRows, (r) => [r.playlistId, r.name]);

    const key = makeSourceKey('xtream', params.url, params.user);
    const existing = key ? (await storage.getAll('playlists')).find((p) => makeSourceKey(p.type, p.url, p.username) === key) : undefined;

    const now = Date.now();
    const record: PlaylistRecord = {
        v: 1,
        id: stagingId,
        type: 'xtream',
        name: existing?.name ?? params.name,
        url: params.url,
        username: params.user,
        password: params.pass,
        channelCount: rows.length,
        groupCount: groups.length,
        radioCount: 0,
        drmCount: 0,
        skipped: streamsResult.data.length - rows.length,
        importDate: existing?.importDate ?? now,
        lastRefresh: now,
        etag: null,
        lastModified: null,
        contentFingerprint: null,
    };
    await storage.bulkPut('playlists', [record], (r) => r.id);

    if (existing && existing.id !== stagingId) {
        await storage.deleteByPlaylistId('channels', existing.id);
        await storage.deleteByPlaylistId('groups', existing.id);
        await storage.deleteRow('playlists', existing.id);
    }

    return {
        ok: true,
        summary: {
            sourceId: record.id,
            total: rows.length,
            groupCount: groups.length,
            skipped: record.skipped,
            updated: existing !== undefined,
        },
    };
}

/** Builds channel rows in Dutch-first category order (Feature-driving NL priority) and their matching `GroupMeta[]`, in one pass so `firstIndex` stays consistent with row order. */
function buildRows(
    source: XtreamSource,
    orderedCategories: readonly XtreamCategory[],
    streams: readonly XtreamLiveStream[],
): { rows: ChannelRow[]; groups: GroupMeta[] } {
    const byCategory = new Map<string, XtreamLiveStream[]>();
    for (const stream of streams) {
        const bucket = byCategory.get(stream.categoryId);
        if (bucket) bucket.push(stream);
        else byCategory.set(stream.categoryId, [stream]);
    }

    const rows: ChannelRow[] = [];
    const groups: GroupMeta[] = [];
    const seenCategoryIds = new Set<string>();

    for (const category of orderedCategories) {
        const categoryStreams = byCategory.get(category.id);
        if (!categoryStreams || categoryStreams.length === 0) continue;
        seenCategoryIds.add(category.id);
        appendGroup(rows, groups, category.name, categoryStreams, source);
    }

    const ungrouped = streams.filter((s) => !seenCategoryIds.has(s.categoryId));
    if (ungrouped.length > 0) appendGroup(rows, groups, UNGROUPED, ungrouped, source);

    return { rows, groups };
}

function appendGroup(
    rows: ChannelRow[],
    groups: GroupMeta[],
    groupName: string,
    streams: readonly XtreamLiveStream[],
    source: XtreamSource,
): void {
    const firstIndex = rows.length;
    for (const stream of streams) {
        rows.push({
            id: crypto.randomUUID(),
            name: stream.name,
            url: liveStreamUrl(source, stream.streamId),
            group: groupName,
            logo: stream.icon ?? null,
            tvgId: stream.epgChannelId ?? null,
            radio: false,
        });
    }
    groups.push({ name: groupName, count: streams.length, firstIndex });
}

function toChannelRecord(row: ChannelRow, playlistId: string, index: number): ChannelRecord {
    return {
        playlistId,
        index,
        name: row.name,
        url: row.url,
        logo: row.logo,
        group: row.group,
        tvgId: row.tvgId,
        radio: row.radio,
    };
}
