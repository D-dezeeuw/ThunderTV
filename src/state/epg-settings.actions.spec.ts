import { setValue, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { ChannelRecord, EpgCatalogRecord, EpgProgramRecord } from '../core/storage';
import { findCountry, plainFeedUrls } from '../epg/countries';
import { resetMappingCacheForTests, saveMapping } from '../epg/match';
import { clearEpgCache, refreshEpgCatalog } from './epg-settings.actions';
import { EPG_CACHE_STATE, EPG_CATALOG_COUNT } from './epg-settings';
import { initGuideState } from './guide';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get } from './typed';

const NL = findCountry('Netherlands')!;
const NL_URLS = plainFeedUrls(NL);
const FEED_ONE = NL_URLS[0]!;
const FEED_TWO = NL_URLS[1]!;

const CHANNEL: ChannelRecord = {
    playlistId: 'p1',
    index: 0,
    name: '24 Kitchen',
    url: 'http://example.com/live/bob/secret/1.m3u8',
    logo: null,
    group: null,
    tvgId: '24 Kitchen.nl',
    radio: false,
};

beforeEach(() => {
    vi.stubGlobal('DecompressionStream', undefined);
    setValue(SETTINGS_LIVE_COUNTRY, 'NL');
});

afterEach(() => {
    vi.unstubAllGlobals();
    resetMappingCacheForTests();
});

describe('refreshEpgCatalog', () => {
    it('goes busy -> done and force-refetches, bypassing the TTL', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            await storage.set(`epg.feed.meta.${FEED_ONE}`, { etag: null, lastFetchedAt: Date.now() });
            await storage.set(`epg.feed.meta.${FEED_TWO}`, { etag: null, lastFetchedAt: Date.now() });
            http.onGet(FEED_ONE).reply({ kind: 'ok', body: '<tv></tv>' });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: '<tv></tv>' });

            await refreshEpgCatalog();
            tick();

            expect(http.calls.length).toBeGreaterThan(0); // TTL-fresh would otherwise skip both
            expect(get<string>(EPG_CACHE_STATE)).toBe('done');
        });
    });

    it('goes busy -> failed when the pipeline throws', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initGuideState();
            tick();
            // No channels stubbed on the storage mock's http at all — an
            // unmatched country token makes loadDefaultEpg() a no-op, not a
            // throw, so force a real failure via a broken settings value.
            const originalGetAll = storage.getAll.bind(storage);
            storage.getAll = () => Promise.reject(new Error('boom'));

            await refreshEpgCatalog();
            tick();

            expect(get<string>(EPG_CACHE_STATE)).toBe('failed');
            storage.getAll = originalGetAll;
        });
    });
});

describe('clearEpgCache', () => {
    it('clears the catalog/guide tables, feed bookkeeping, and the mapping, then republishes', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initGuideState();
            tick();

            const catalogRow: EpgCatalogRecord = {
                country: 'NL',
                id: '24 Kitchen.nl',
                displayName: '24 Kitchen',
                normKey: '24 KITCHEN',
                icon: null,
                sourceFile: FEED_ONE,
            };
            await storage.bulkPut('epgCatalog', [catalogRow], (r) => [r.country, r.id]);
            await storage.bulkPut('epgChannels', [{ id: '24 Kitchen.nl', displayName: '24 Kitchen', icon: null }], (r) => r.id);
            const program: EpgProgramRecord = { channelId: '24 Kitchen.nl', start: 0, stop: 3600_000, title: 'x', description: null };
            await storage.bulkPut('epgPrograms', [program], (r) => [r.channelId, r.start]);
            await storage.set(`epg.feed.meta.${FEED_ONE}`, { etag: '"abc"', lastFetchedAt: Date.now() });
            await saveMapping('NL', {
                matches: [{ channelKey: '24 KITCHEN', catalogId: '24 Kitchen.nl', method: 'tvg-id' }],
                unmatchedChannels: [],
                unmatchedCatalog: [],
            });

            await clearEpgCache();
            tick();

            expect(await storage.getAll('epgCatalog')).toEqual([]);
            expect(await storage.getAll('epgChannels')).toEqual([]);
            expect(await storage.getAll('epgPrograms')).toEqual([]);
            expect(await storage.get(`epg.feed.meta.${FEED_ONE}`)).toBeUndefined();
            const { loadMapping } = await import('../epg/match');
            expect(await loadMapping('NL')).toEqual([]);
            expect(get<number>(EPG_CATALOG_COUNT)).toBe(0);
            expect(get<string>(EPG_CACHE_STATE)).toBe('done');
        });
    });

    it('still clears the bulk tables even when no country is selected', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initGuideState();
            tick();
            setValue(SETTINGS_LIVE_COUNTRY, '');
            tick();
            await storage.bulkPut('epgCatalog', [{ country: 'NL', id: 'a.nl', displayName: 'A', normKey: 'A', icon: null, sourceFile: 'f' }], (r) => [
                r.country,
                r.id,
            ]);

            await clearEpgCache();
            tick();

            expect(await storage.getAll('epgCatalog')).toEqual([]);
            expect(get<string>(EPG_CACHE_STATE)).toBe('done');
        });
    });
});
