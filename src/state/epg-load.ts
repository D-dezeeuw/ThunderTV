import { groupChannels } from '../channels/grouping';
import { getPlatform } from '../core/platform';
import type { ChannelRecord } from '../core/storage';
import { deriveCatalog, type ParsedFeedFile } from '../epg/catalog';
import { getCountryCatalog, replaceFileCatalog } from '../epg/catalog-storage';
import { countryForLiveToken } from '../epg/countries';
import { fetchCountryFeeds } from '../epg/feed-fetch';
import { getMappingSync, matchChannels, matchedCatalogIds, primeMappingCache, saveMapping } from '../epg/match';
import { getRows } from '../m3u/channel-memory';
import { PROGRAM_MAX_AGE_MS, pruneStalePrograms } from '../epg/prune';
import { parseXmltvDocument, toEpgRecords } from '../epg/xmltv';
import { makeChannelRowId, type ChannelRow } from '../m3u/types';
import { EPG_CATALOG_COUNT, EPG_FEED_THROUGH } from './epg-settings';
import { persist } from './persist';
import { loadGuideChannels } from './guide-load';
import { refreshLiveRows } from './live.actions';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get, set } from './typed';

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
/** `country|rowCount|catalogSize` of the last completed match — see `loadDefaultEpg()`'s re-match gate. Module memory, so it resets on reload exactly like the caches in `live-rows.ts`. */
let lastMatchSignature = '';

/** @internal Test-only — lets a spec assert the re-match gate both skips and doesn't. */
export function resetEpgLoadForTests(): void {
    lastMatchSignature = '';
}

export async function loadDefaultEpg(force = false): Promise<void> {
    await pruneStalePrograms(PROGRAM_MAX_AGE_MS);

    const liveCountryToken = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const country = countryForLiveToken(liveCountryToken);
    if (!country) {
        set(EPG_CATALOG_COUNT, 0); // no country selected, or the token isn't in the registry
        return;
    }

    const storage = getPlatform().storage;
    // `getRows()` is the same channel set `storage.getAll('channels')` would
    // return, already in memory (`src/m3u/channel-memory.ts`, populated by
    // the playlist load this boot runs alongside). Reading IndexedDB again
    // for 26k records — on every single reload, purely to re-derive a
    // mapping that `primeEpgMapping()` has already restored — was a large
    // part of "the EPG takes forever on every reload". The storage read
    // stays as the fallback for the boot ordering where the playlist load
    // hasn't populated memory yet.
    const memoryRows = getRows();
    const channelRows: ChannelRow[] = memoryRows.length > 0 ? [...memoryRows] : toChannelRows(await storage.getAll('channels'));
    if (channelRows.length === 0) {
        await publishEpgCatalogCount(liveCountryToken); // nothing local to match against yet, but a prior country's catalog may still be stored
        return;
    }

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

    // Re-match when something could actually have changed, not on every
    // call. The original comment here claimed re-matching was cheap; it
    // isn't — `groupChannels()` over a real 26k-row playlist is a
    // hundreds-of-milliseconds pass on desktop and far worse on a TV SoC,
    // and it ran on every reload to recompute a mapping that was already
    // restored from storage by `primeEpgMapping()`.
    //
    // The three inputs that can change its result are the country, the
    // playlist (row count), and the catalog (entry count) — so a signature
    // over those decides. A newly imported playlist still gets matched
    // inside the feed's TTL window, which is what Feature 31.5.7 wanted;
    // an unchanged reload now skips the work entirely.
    //
    // Deliberately no `country` filter on the channel side (unlike
    // `live-rows.ts`'s grouping): the catalog itself is already scoped to
    // one country per run, so it's the only boundary that needs to hold.
    // Reusing the Live view's country prefix filter here too would silently
    // drop channels the provider didn't prefix with "| NL |" even though
    // they'd correctly just fail to match a same-country catalog entry
    // anyway — filtering twice only costs legitimate matches, never adds.
    const catalog = await getCountryCatalog(liveCountryToken);
    const signature = `${liveCountryToken}|${String(channelRows.length)}|${String(catalog.length)}`;
    let matchedIds: ReadonlySet<string>;
    if (signature === lastMatchSignature && getMappingSync(liveCountryToken).length > 0) {
        matchedIds = new Set(getMappingSync(liveCountryToken).map((m) => m.catalogId));
    } else {
        const { channels: groupedChannels } = groupChannels(channelRows);
        const matchResult = matchChannels(groupedChannels, catalog);
        await saveMapping(liveCountryToken, matchResult);
        lastMatchSignature = signature;
        // saveMapping() already updated the sync cache getMappingSync() reads;
        // rebuild Live now so a completed match shows up without a reload
        // (Feature 31.6.9 — the mapping recompute invalidates the cache).
        refreshLiveRows();
        matchedIds = matchedCatalogIds(matchResult);
    }
    let wroteGuideData = false;
    for (const file of parsedFiles) {
        const { channels, programs } = toEpgRecords(file.document, matchedIds, country);
        if (channels.length > 0) {
            await storage.bulkPut('epgChannels', channels, (r) => r.id);
            wroteGuideData = true;
        }
        if (programs.length > 0) {
            await storage.bulkPut('epgPrograms', programs, (r) => [r.channelId, r.start]);
        }
    }

    // How far the feed itself reaches, captured before `pruneStalePrograms()`
    // can delete the evidence — see `EPG_FEED_THROUGH`'s doc. Only written
    // when something was actually parsed, so a TTL-skipped reload keeps the
    // previously persisted value instead of resetting it to 0.
    if (parsedFiles.length > 0) {
        let newest = 0;
        for (const file of parsedFiles) {
            for (const program of file.document.programs) {
                if (program.stop > newest) newest = program.stop;
            }
        }
        set(EPG_FEED_THROUGH, newest);
        persist(EPG_FEED_THROUGH);
    }

    if (wroteGuideData) await loadGuideChannels();
    await publishEpgCatalogCount(liveCountryToken);
}

/** Settings → Diagnostics' catalog-size readout (Feature 31.7.5) — kept current on every run, not just the ones that fetched something. */
export async function publishEpgCatalogCount(liveCountryToken: string): Promise<void> {
    const rows = await getCountryCatalog(liveCountryToken);
    set(EPG_CATALOG_COUNT, rows.length);
}

/**
 * Restores `src/epg/match.ts`'s synchronous mapping cache from storage at
 * boot (Feature 31.8.8) — before `live-rows.ts`'s `ensureLiveRows()` (a
 * synchronous hot path) ever reads it, and without delaying first paint:
 * called alongside `loadGuideChannels()`, not awaited by `bootstrap.ts`.
 */
export async function primeEpgMapping(): Promise<void> {
    const liveCountryToken = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    if (!liveCountryToken) return;
    await primeMappingCache(liveCountryToken);
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
