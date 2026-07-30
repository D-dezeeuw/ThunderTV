import { getPlatform } from '../core/platform';
import { getShortEpg, getXmltvGuide, type XtreamEpgEntry } from '../xtream/epg';
import { parseXmltvDocument } from '../epg/xmltv';
import type { EpgChannelRecord, EpgProgramRecord } from '../core/storage';
import { getRows } from '../m3u/channel-memory';
import { programsForChannel } from './epg-index';
import { EPG_FEED_THROUGH } from './epg-settings';
import { loadGuideChannels } from './guide-load';
import { persist } from './persist';
import { set } from './typed';
import { resolveActiveXtreamSource } from './xtream-refresh';

/**
 * The Xtream guide pipeline — the EPG path that actually works for a
 * subscription.
 *
 * `src/state/epg-load.ts` (the country-catalog pipeline) fetches a national
 * XMLTV feed from a third party and then *guesses* which of the
 * subscription's channels each entry describes, by normalized name and
 * curated alias. That guessing is the expensive, lossy part: on the demo
 * playlist it bound 139 of 15,243 grouped channels, and the upstream feed it
 * reads has not been updated since October 2025.
 *
 * Here there is nothing to guess. The panel's own `xmltv.php` is keyed by
 * the same `epg_channel_id` that `src/xtream/client.ts` already writes onto
 * every channel row as `tvgId`, so a channel and its programmes are joined
 * by string equality. No catalog, no matcher, no country registry.
 *
 * Two entry points, mirroring how the guide is actually used:
 *
 *  - `loadXtreamGuide()` — one `xmltv.php` call per source, TTL-gated,
 *    filling the whole grid.
 *  - `fetchChannelEpgOnDemand()` — one `get_short_epg` call for a single
 *    channel the bulk guide did not cover, so opening it still shows
 *    now/next instead of nothing.
 */

/** Matches `feed-fetch.ts`'s window and reasoning: a panel's guide refreshes daily at best, and re-pulling a multi-megabyte document on every reload is exactly the cost this app was already paying elsewhere. */
export const XTREAM_GUIDE_TTL_MS = 12 * 60 * 60 * 1000;

const GUIDE_META_KEY = 'epg.xtream.meta';

interface GuideMeta {
    /** `PlaylistRecord.id` the stored guide belongs to — a source switch must not read as fresh. */
    sourceId: string;
    fetchedAt: number;
}

/** Per-channel on-demand results already fetched this session, so re-opening a channel costs nothing. Module memory, like every other hot cache in `src/state/`. */
const onDemandFetched = new Set<string>();

/** @internal Test-only reset. */
export function resetXtreamEpgForTests(): void {
    onDemandFetched.clear();
}

/**
 * Pulls the account's whole guide and stores it. Returns the number of
 * programmes written — `0` covers both "the panel serves no EPG" and "not
 * an Xtream source", which callers treat identically: nothing to show, and
 * nothing to complain about either.
 *
 * `force` bypasses the TTL, wired to the same Settings refresh action the
 * country-catalog path uses.
 */
export async function loadXtreamGuide(force = false): Promise<number> {
    const account = await resolveActiveXtreamSource();
    if (!account) return 0;

    const storage = getPlatform().storage;
    const meta = await storage.get<GuideMeta>(GUIDE_META_KEY);
    const fresh = meta && meta.sourceId === account.sourceId && Date.now() - meta.fetchedAt < XTREAM_GUIDE_TTL_MS;
    if (!force && fresh) return 0;

    const result = await getXmltvGuide(account.source);
    if (!result.ok) {
        // Bookkept on failure too, for `feed-fetch.ts`'s reason: without it a
        // panel that serves no guide is re-asked on every single reload.
        await storage.set(GUIDE_META_KEY, { sourceId: account.sourceId, fetchedAt: Date.now() } satisfies GuideMeta);
        return 0;
    }

    const document = parseXmltvDocument(result.data);
    const written = await storeGuide(document.channels, document.programs);
    await storage.set(GUIDE_META_KEY, { sourceId: account.sourceId, fetchedAt: Date.now() } satisfies GuideMeta);

    if (written > 0) await loadGuideChannels();
    return written;
}

/**
 * Recovers the panel's stream id from a channel row's URL. Both Xtream live
 * shapes end in the id — `/live/<user>/<pass>/1359.m3u8` and the legacy
 * `/<user>/<pass>/1359` — so the last path segment minus any extension is
 * it. Read from the URL rather than stored as a new field because the URL is
 * already the thing every row carries and every import path fills in.
 *
 * `null` for anything that isn't a numeric id: an M3U source's channel URL
 * is an arbitrary stream address, and asking a panel about it is meaningless.
 */
export function streamIdFromUrl(url: string): number | null {
    const path = url.split('?')[0] ?? '';
    const last = path.split('/').filter(Boolean).pop();
    if (!last) return null;
    const withoutExt = last.replace(/\.[a-z0-9]{2,5}$/i, '');
    if (!/^\d+$/.test(withoutExt)) return null;
    return Number(withoutExt);
}

/**
 * The on-demand entry point: called when a channel starts playing, it fetches
 * that channel's guide only if nothing already covers it. Fire-and-forget —
 * the caller never waits, because playback must not be gated on a guide.
 */
export async function ensureChannelEpg(row: { url: string; tvgId: string | null }): Promise<boolean> {
    const epgId = row.tvgId;
    if (!epgId || programsForChannel(epgId).length > 0) return false;
    const streamId = streamIdFromUrl(row.url);
    if (streamId === null) return false;
    return fetchChannelEpgOnDemand(streamId, epgId);
}

/**
 * Fills in one channel the bulk guide missed. `epgId` is the row's `tvgId`;
 * a channel without one has no key the panel could answer for, so it is
 * skipped rather than guessed at.
 *
 * Deliberately quiet: a panel with no data for this channel is the common
 * case, not an error, and the caller only ever wants "did anything arrive".
 */
export async function fetchChannelEpgOnDemand(streamId: number, epgId: string): Promise<boolean> {
    if (!epgId || onDemandFetched.has(epgId)) return false;
    onDemandFetched.add(epgId);

    const account = await resolveActiveXtreamSource();
    if (!account) return false;

    const result = await getShortEpg(account.source, streamId, epgId);
    if (!result.ok || result.data.length === 0) return false;

    const written = await storeGuide(channelRecordsFor(epgId), result.data.map(toProgramRecord));
    if (written > 0) await loadGuideChannels();
    return written > 0;
}

/**
 * A `get_short_epg` response carries programmes but no `<channel>` element,
 * so the channel row is synthesized from what the playlist already knows —
 * otherwise `guide-load.ts` would drop the programmes for want of a channel
 * to hang them on. The display name comes from the matching playlist row,
 * which is the name the viewer already sees in the list.
 */
function channelRecordsFor(epgId: string): EpgChannelRecord[] {
    const row = getRows().find((candidate) => candidate.tvgId === epgId);
    return [{ id: epgId, displayName: row?.name ?? epgId, icon: row?.logo ?? null }];
}

function toProgramRecord(entry: XtreamEpgEntry): EpgProgramRecord {
    return {
        channelId: entry.channelId,
        start: entry.start,
        stop: entry.stop,
        title: entry.title,
        description: entry.description,
    };
}

/** Writes both tables and records how far the guide reaches, returning the programme count. Shared by the bulk and on-demand paths so they cannot drift on storage keys. */
async function storeGuide(
    channels: readonly EpgChannelRecord[],
    programs: readonly EpgProgramRecord[],
): Promise<number> {
    const storage = getPlatform().storage;
    if (channels.length > 0) await storage.bulkPut('epgChannels', [...channels], (r) => r.id);
    if (programs.length === 0) return 0;

    await storage.bulkPut('epgPrograms', [...programs], (r) => [r.channelId, r.start]);

    // Same role as in `epg-load.ts`: captured at ingest because `prune.ts`
    // deletes the evidence, and it is what lets the Guide say "this source's
    // data ends on <date>" instead of rendering a blank grid.
    let newest = 0;
    for (const program of programs) {
        if (program.stop > newest) newest = program.stop;
    }
    if (newest > 0) {
        set(EPG_FEED_THROUGH, newest);
        persist(EPG_FEED_THROUGH);
    }
    return programs.length;
}
