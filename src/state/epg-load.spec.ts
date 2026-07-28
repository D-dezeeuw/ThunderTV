import { afterEach, describe, expect, it } from 'vitest';
import { resetState, tick } from 'spektrum';
import { withFakePlatform } from '../core/platform/fake-platform';
import { XMLTV_SOURCE_URLS } from '../epg/xmltv';
import type { ChannelRecord } from '../core/storage';
import { loadDefaultEpg, XMLTV_REFRESH_TTL_MS } from './epg-load';
import { initGuideState } from './guide';
import { get } from './typed';
import { GUIDE_CHANNELS, type GuideChannel } from './guide';

const [FEED_ONE, FEED_TWO] = XMLTV_SOURCE_URLS;

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

describe('state/epg-load', () => {
    afterEach(() => {
        resetState();
    });

    it('fetches both feeds, stores only matched channels/programs, and records the fetch time', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();
            await storage.bulkPut('channels', [CHANNEL], (r) => [r.playlistId, r.index]);
            http.onGet(FEED_ONE).reply({ kind: 'ok', body: XML });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });

            await loadDefaultEpg();

            const channels = await storage.getAll('epgChannels');
            expect(channels).toEqual([{ id: '24 Kitchen.nl', displayName: '24 Kitchen.nl', icon: null }]);

            const programs = await storage.getAll('epgPrograms');
            expect(programs).toHaveLength(1);
            expect(programs[0]).toMatchObject({ channelId: '24 Kitchen.nl', title: 'Cooking Show' });

            const lastFetchedAt = await storage.get<number>('epg.xmltv.lastFetchedAt');
            expect(typeof lastFetchedAt).toBe('number');
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
            await storage.set('epg.xmltv.lastFetchedAt', Date.now() - (XMLTV_REFRESH_TTL_MS - 1000));

            await loadDefaultEpg();
            expect(http.calls).toHaveLength(0);

            http.onGet(FEED_ONE).reply({ kind: 'ok', body: XML });
            http.onGet(FEED_TWO).reply({ kind: 'ok', body: EMPTY_XML });
            await loadDefaultEpg(true);
            expect(http.calls.length).toBeGreaterThan(0);
        });
    });

    it('no-ops when there are no locally known channels at all', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            tick();

            await loadDefaultEpg();

            expect(http.calls).toHaveLength(0);
            expect(await storage.getAll('epgChannels')).toHaveLength(0);
        });
    });
});
