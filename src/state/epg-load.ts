import { getPlatform } from '../core/platform';
import type { StorageAdapter } from '../core/storage';
import { fetchXmltvSource, matchXmltvChannels, parseXmltvDocument, toEpgRecords, XMLTV_SOURCE_URLS, type LocalChannelKey } from '../epg/xmltv';
import { loadGuideChannels } from './guide-load';

/**
 * Auto-loads EPG data on boot from the bulk NL XMLTV feeds (`src/epg/xmltv.ts`)
 * — a small, fixed number of HTTP requests (one per feed) rather than a
 * per-channel API call, matched against every locally known channel (cheap
 * once the feed is already in memory, so there's no reason to restrict the
 * match to favorites/a fallback subset the way a per-channel design would
 * have needed to).
 */

/** Small-keyed bookkeeping (not a bulk table — `StorageAdapter`'s `get`/`set` surface) recording the last successful fetch attempt, so a reload inside the upstream feed's own refresh cadence doesn't re-download it. */
const XMLTV_LAST_FETCHED_KEY = 'epg.xmltv.lastFetchedAt';

/** The upstream feed refreshes once daily at 03:00 UTC (per its own docs) — comfortably inside a half-day TTL without re-fetching on every reload. */
export const XMLTV_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Fetches, matches, and stores EPG data for every locally known channel.
 * `force` bypasses the freshness check (used by a future manual "refresh
 * guide" action); boot always honors it.
 */
export async function loadDefaultEpg(force = false): Promise<void> {
    const storage = getPlatform().storage;

    if (!force) {
        const lastFetchedAt = await storage.get<number>(XMLTV_LAST_FETCHED_KEY);
        if (typeof lastFetchedAt === 'number' && Date.now() - lastFetchedAt < XMLTV_REFRESH_TTL_MS) return;
    }

    const localChannels = await loadLocalChannelKeys(storage);
    if (localChannels.length === 0) return;

    let wroteAny = false;
    for (const url of XMLTV_SOURCE_URLS) {
        // One dead/slow feed must not block the other, or the whole batch.
        const xml = await fetchXmltvSource(url);
        if (!xml) continue;

        const document = parseXmltvDocument(xml);
        const matched = matchXmltvChannels(document.channels, localChannels);
        if (matched.size === 0) continue;

        const { channels, programs } = toEpgRecords(document, matched);
        if (channels.length > 0) {
            await storage.bulkPut('epgChannels', channels, (r) => r.id);
            wroteAny = true;
        }
        if (programs.length > 0) {
            await storage.bulkPut('epgPrograms', programs, (r) => [r.channelId, r.start]);
        }
    }

    await storage.set(XMLTV_LAST_FETCHED_KEY, Date.now());
    if (wroteAny) await loadGuideChannels();
}

async function loadLocalChannelKeys(storage: StorageAdapter): Promise<LocalChannelKey[]> {
    const records = await storage.getAll('channels');
    return records.map((record) => ({ tvgId: record.tvgId, name: record.name }));
}
