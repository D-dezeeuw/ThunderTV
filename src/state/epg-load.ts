import { groupChannels } from '../channels/grouping';
import { getPlatform } from '../core/platform';
import type { ChannelRecord } from '../core/storage';
import { deriveCatalog, type ParsedFeedFile } from '../epg/catalog';
import { getCountryCatalog, replaceFileCatalog } from '../epg/catalog-storage';
import { countryForLiveToken } from '../epg/countries';
import { fetchCountryFeeds } from '../epg/feed-fetch';
import { matchChannels, matchedCatalogIds, saveMapping } from '../epg/match';
import { PROGRAM_MAX_AGE_MS, pruneStalePrograms } from '../epg/prune';
import { parseXmltvDocument, toEpgRecords } from '../epg/xmltv';
import { makeChannelRowId, type ChannelRow } from '../m3u/types';
import { loadGuideChannels } from './guide-load';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get } from './typed';

/**
 * Boot-time EPG pipeline (Feature 31.8) — one fetch/parse/match/store cycle
 * per selected country, replacing the old NL-only, exact-match-only design
 * (`XMLTV_SOURCE_URLS`/`matchXmltvChannels`, both deleted): feeds now come
 * from the country registry (`src/epg/countries.ts`), fetching is polite
 * and TTL/ETag-aware (`src/epg/feed-fetch.ts`), and matching is the
 * tvg-id → name → curated-alias ladder (`src/epg/match.ts`) instead of
 * exact tvg-id/name equality only. Each fetched file is parsed exactly
 * once and feeds both the country catalog and the Guide's
 * `epgChannels`/`epgPrograms` tables — one download, one parse, two
 * consumers (Feature 31.3.1).
 *
 * `force` bypasses every file's fetch TTL (wired to Settings' manual
 * "Refresh guide data"); boot always calls this without it.
 */
export async function loadDefaultEpg(force = false): Promise<void> {
    await pruneStalePrograms(PROGRAM_MAX_AGE_MS);

    const liveCountryToken = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const country = countryForLiveToken(liveCountryToken);
    if (!country) return; // no country selected, or the token isn't in the registry

    const storage = getPlatform().storage;
    const channelRecords = await storage.getAll('channels');
    if (channelRecords.length === 0) return; // nothing local to match against yet

    const fetchResult = await fetchCountryFeeds(country, { force });
    const parsedFiles: ParsedFeedFile[] = [];
    for (const file of fetchResult.files) {
        if (file.outcome === 'fetched' && file.text !== undefined) {
            parsedFiles.push({ sourceFile: file.url, document: parseXmltvDocument(file.text) });
        }
    }

    // Catalog first (Feature 31.8.4): scoped per file, so a file that was
    // skipped this run (still TTL-fresh, or a 304) keeps its previously
    // stored rows rather than being wiped by an incomplete replace.
    for (const file of parsedFiles) {
        const { entries } = deriveCatalog(liveCountryToken, country, [file]);
        await replaceFileCatalog(liveCountryToken, file.sourceFile, entries);
    }

    // Re-match on every call, not only when something was fetched: a newly
    // imported playlist gets matched against the existing catalog even
    // inside the feed's TTL window, and this is cheap (Feature 31.5.7).
    //
    // Deliberately no `country` filter here (unlike `live-rows.ts`'s
    // grouping): the catalog itself is already scoped to one country per
    // run, so it's the only boundary that needs to hold. Reusing the Live
    // view's country prefix filter on the channel side too would silently
    // drop channels the provider didn't prefix with "| NL |" even though
    // they'd correctly just fail to match a same-country catalog entry
    // anyway — filtering twice only costs legitimate matches, never adds.
    const catalog = await getCountryCatalog(liveCountryToken);
    const { channels: groupedChannels } = groupChannels(toChannelRows(channelRecords));
    const matchResult = matchChannels(groupedChannels, catalog);
    await saveMapping(liveCountryToken, matchResult);

    const matchedIds = matchedCatalogIds(matchResult);
    let wroteGuideData = false;
    for (const file of parsedFiles) {
        const { channels, programs } = toEpgRecords(file.document, matchedIds);
        if (channels.length > 0) {
            await storage.bulkPut('epgChannels', channels, (r) => r.id);
            wroteGuideData = true;
        }
        if (programs.length > 0) {
            await storage.bulkPut('epgPrograms', programs, (r) => [r.channelId, r.start]);
        }
    }

    if (wroteGuideData) await loadGuideChannels();
}

function toChannelRows(records: readonly ChannelRecord[]): ChannelRow[] {
    return records.map((r) => ({
        id: makeChannelRowId(r.playlistId, r.index),
        name: r.name,
        url: r.url,
        group: r.group,
        logo: r.logo,
        tvgId: r.tvgId,
        radio: r.radio,
        ...(r.drm ? { drm: r.drm } : {}),
    }));
}
