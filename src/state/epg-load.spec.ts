import { resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { ChannelRecord, EpgCatalogRecord } from '../core/storage';
import { findCountry, plainFeedUrls } from '../epg/countries';
import { loadMapping } from '../epg/match';
import { loadDefaultEpg } from './epg-load';
import { initGuideState } from './guide';
import { GUIDE_CHANNELS, type GuideChannel } from './guide';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get } from './typed';

const NL = findCountry('Netherlands')!;
const NL_URLS = plainFeedUrls(NL);
const FEED_ONE = NL_URLS[0]!;
const FEED_TWO = NL_URLS[1]!;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="24 Kitchen.nl"><display-name>24 Kitchen.nl</display-name></channel>
  <programme start="20260101210000 +0000" stop="20260101220000 +0000" channel="24 Kitchen.nl">
    <title>Cooking Show</title>
  </programme>
</tv>`;

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?><tv></tv>`;

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

/** Plain-URL bodies throughout — `FakeHttpAdapter` only carries strings, and gzip decoding is covered directly in `feed-fetch.spec.ts`. */
beforeEach(() => {
    vi.stubGlobal('DecompressionStream', undefined);
    setValue(SETTINGS_LIVE_COUNTRY, 'NL');
});

afterEach(() => {
    resetState();
    vi.unstubAllGlobals();
});

describe('state/epg-load', () => {
    it('fetches both feeds, stores the country catalog, matches channels, and stores matched programs', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            http.onGet(FEED_ONE).reply({ kind: 'ok', body: XML });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });

            await loadDefaultEpg();

            const catalog = await storage.getAll('epgCatalog');
            expect(catalog.map((c) => c.id)).toEqual(['24 Kitchen.nl']);

            const channels = await storage.getAll('epgChannels');
            // displayName is the feed id with the country suffix stripped
            // (`.nl`), same as the country catalog's own naming — the Guide
            // used to show the raw, unstripped feed name.
            expect(channels).toEqual([{ id: '24 Kitchen.nl', displayName: '24 Kitchen', icon: null }]);

            const programs = await storage.getAll('epgPrograms');
            expect(programs).toHaveLength(1);
            expect(programs[0]).toMatchObject({ channelId: '24 Kitchen.nl', title: 'Cooking Show' });

            const mapping = await loadMapping('NL');
            expect(mapping).toEqual([{ channelKey: '24KITCHEN', catalogId: '24 Kitchen.nl', method: 'tvg-id' }]);
        });
    });

    it('refreshes guide.channels after a successful fetch', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            http.onGet(FEED_ONE).reply({ kind: 'ok', body: XML });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });

            await loadDefaultEpg();
            tick();

            const channels = get<GuideChannel[]>(GUIDE_CHANNELS);
            expect(channels?.[0]?.id).toBe('24 Kitchen.nl');
        });
    });

    it('a failed feed does not block the other from being stored', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            http.onGet(FEED_ONE).reply({ kind: 'http', status: 500 });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: XML });

            await loadDefaultEpg();

            const channels = await storage.getAll('epgChannels');
            expect(channels).toHaveLength(1);
        });
    });

    it('skips re-fetching within the TTL, but re-fetches once force is passed', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            await storage.set(`epg.feed.meta.${FEED_ONE}`, { etag: null, lastFetchedAt: Date.now() });
            await storage.set(`epg.feed.meta.${FEED_TWO}`, { etag: null, lastFetchedAt: Date.now() });

            await loadDefaultEpg();
            expect(http.calls).toHaveLength(0);

            http.onGet(FEED_ONE).reply({ kind: 'ok', body: XML });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });
            await loadDefaultEpg(true);
            expect(http.calls.length).toBeGreaterThan(0);
        });
    });

    it('no-ops (no fetch) when there are no locally known channels at all', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();

            await loadDefaultEpg();

            expect(http.calls).toHaveLength(0);
            expect(await storage.getAll('epgChannels')).toHaveLength(0);
        });
    });

    it('no-ops (no fetch) when no country is selected', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            setValue(SETTINGS_LIVE_COUNTRY, '');
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);

            await loadDefaultEpg();

            expect(http.calls).toHaveLength(0);
        });
    });

    it('re-matches against an already-stored catalog on a TTL-fresh run, without any new fetch — a newly imported playlist still gets matched', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            // Simulates a catalog + feed bookkeeping already derived by an
            // earlier, successful run — both feeds are TTL-fresh, so this
            // call must make zero HTTP requests.
            const preExisting: EpgCatalogRecord = {
                country: 'NL',
                id: '24 Kitchen.nl',
                displayName: '24 Kitchen',
                normKey: '24 KITCHEN',
                icon: null,
                sourceFile: FEED_ONE,
            };
            await storage.bulkPut('epgCatalog', [preExisting], (r) => [r.country, r.id]);
            await storage.set(`epg.feed.meta.${FEED_ONE}`, { etag: null, lastFetchedAt: Date.now() });
            await storage.set(`epg.feed.meta.${FEED_TWO}`, { etag: null, lastFetchedAt: Date.now() });

            // The playlist is only imported now — after the catalog already exists.
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            await loadDefaultEpg();

            expect(http.calls).toHaveLength(0);
            expect(await loadMapping('NL')).toEqual([
                { channelKey: '24KITCHEN', catalogId: '24 Kitchen.nl', method: 'tvg-id' },
            ]);
        });
    });

    it('matches an alias-spelled feed entry against an already-resolved playlist channel', async () => {
        const aliasXml = `<?xml version="1.0" encoding="UTF-8"?>
<tv><channel id="NED 1.nl"><display-name>NED 1.nl</display-name></channel></tv>`;
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            const npo1: ChannelRecord = { ...CHANNEL, name: 'NED 1', tvgId: null };
            await storage.bulkPut('channels', [npo1], (r) => [r.playlistId, r.index]);
            http.onGet(FEED_ONE).reply({ kind: 'ok', body: aliasXml });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });

            await loadDefaultEpg();

            const mapping = await loadMapping('NL');
            expect(mapping).toEqual([{ channelKey: 'NPO 1', catalogId: 'NED 1.nl', method: 'alias' }]);
        });
    });

    it('prunes epgPrograms older than 24h on every call', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initGuideState();
            tick();
            const staleStop = Date.now() - 25 * 60 * 60 * 1000;
            await storage.bulkPut(
                'epgPrograms',
                [{ channelId: 'x', start: staleStop - 1000, stop: staleStop, title: 'Old', description: null }],
                (r) => [r.channelId, r.start],
            );

            await loadDefaultEpg();

            expect(await storage.getAll('epgPrograms')).toEqual([]);
        });
    });
});
