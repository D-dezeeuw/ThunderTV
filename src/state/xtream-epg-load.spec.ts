import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { PlaylistRecord } from '../core/storage';
import { setRows } from '../m3u/channel-memory';
import { xmltvUrl } from '../xtream/epg';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { setEpgProgramIndex } from './epg-index';
import { initGuideState, GUIDE_CHANNELS, type GuideChannel } from './guide';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { ensureChannelEpg, loadXtreamGuide, resetXtreamEpgForTests, streamIdFromUrl } from './xtream-epg-load';

/**
 * The provider's own guide, end to end. What matters here is the property
 * that motivated the whole path: a channel and its programmes are joined by
 * `epg_channel_id` — the row's `tvgId` — with no name matching anywhere.
 */
const SOURCE: XtreamSource = { url: 'http://panel.test', user: 'bob', pass: 's3cret' };

const PLAYLIST: PlaylistRecord = {
    v: 1,
    id: 'src-1',
    name: 'panel.test',
    type: 'xtream',
    url: SOURCE.url,
    username: SOURCE.user,
    password: SOURCE.pass,
    channelCount: 2,
    groupCount: 1,
    radioCount: 0,
    drmCount: 0,
    skipped: 0,
    importDate: 1,
    lastRefresh: null,
    etag: null,
    lastModified: null,
    contentFingerprint: null,
};

/** Programme bounds well in the future, so `guide-load.ts` keeps them whatever day the suite runs. */
const START = Date.now() + 60 * 60 * 1000;
const STOP = START + 30 * 60 * 1000;

function xmltvBody(): string {
    const fmt = (ms: number): string => {
        const d = new Date(ms);
        const p = (n: number, w = 2): string => String(n).padStart(w, '0');
        return `${String(d.getUTCFullYear())}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
    };
    return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="npo1.nl"><display-name>NPO 1</display-name></channel>
  <programme start="${fmt(START)}" stop="${fmt(STOP)}" channel="npo1.nl"><title>NOS Journaal</title></programme>
</tv>`;
}

describe('streamIdFromUrl()', () => {
    it('reads the id out of the modern /live/ shape', () => {
        expect(streamIdFromUrl('http://panel.test/live/bob/s3cret/1359.m3u8')).toBe(1359);
    });

    it('reads it out of the legacy extension-less shape', () => {
        expect(streamIdFromUrl('http://panel.test/bob/s3cret/1359')).toBe(1359);
    });

    it('declines a non-Xtream stream URL rather than inventing an id', () => {
        expect(streamIdFromUrl('https://cdn.example.com/hls/channel/master.m3u8')).toBeNull();
        expect(streamIdFromUrl('')).toBeNull();
    });
});

describe('loadXtreamGuide()', () => {
    afterEach(() => {
        setEpgProgramIndex(new Map());
        resetXtreamEpgForTests();
        resetState();
    });

    async function seed(): Promise<void> {
        initGuideState();
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
        tick();
        await Promise.resolve();
    }

    it('stores the panel guide and publishes it, joined by epg_channel_id alone', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            await seed();
            await storage.bulkPut('playlists', [PLAYLIST], (r) => r.id);
            http.onGet(xmltvUrl(SOURCE)).reply({ kind: 'ok', body: xmltvBody() });

            const written = await loadXtreamGuide();
            tick();

            expect(written).toBe(1);
            const channels = get<GuideChannel[]>(GUIDE_CHANNELS) ?? [];
            expect(channels.map((c) => c.id)).toEqual(['npo1.nl']);
            expect(channels[0]?.programs[0]?.title).toBe('NOS Journaal');
        });
    });

    it('makes no second request inside the TTL', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            await seed();
            await storage.bulkPut('playlists', [PLAYLIST], (r) => r.id);
            http.onGet(xmltvUrl(SOURCE)).reply({ kind: 'ok', body: xmltvBody() });

            await loadXtreamGuide();
            const afterFirst = http.calls.length;
            await loadXtreamGuide();

            expect(http.calls.length).toBe(afterFirst);
        });
    });

    it('does not re-ask a panel that served no guide, on every reload', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            await seed();
            await storage.bulkPut('playlists', [PLAYLIST], (r) => r.id);
            http.onGet(xmltvUrl(SOURCE)).reply({ kind: 'ok', body: 'Access denied' });

            expect(await loadXtreamGuide()).toBe(0);
            const afterFirst = http.calls.length;
            expect(await loadXtreamGuide()).toBe(0);
            expect(http.calls.length).toBe(afterFirst);
        });
    });

    it('is a no-op for a source that is not an Xtream account', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await seed();
            // Built by omission rather than `username: undefined` —
            // `exactOptionalPropertyTypes` treats those as different things,
            // and an M3U source genuinely has no credential fields at all.
            const withoutCredentials: PlaylistRecord = { ...PLAYLIST, type: 'm3u-url' };
            delete withoutCredentials.username;
            delete withoutCredentials.password;
            await storage.bulkPut('playlists', [withoutCredentials], (r) => r.id);
            expect(await loadXtreamGuide()).toBe(0);
        });
    });
});

describe('ensureChannelEpg()', () => {
    afterEach(() => {
        setEpgProgramIndex(new Map());
        resetXtreamEpgForTests();
        setRows([]);
        resetState();
    });

    const ROW = { id: 'src-1:0', name: 'NPO 1', url: 'http://panel.test/live/bob/s3cret/1359.m3u8', group: null, logo: null, tvgId: 'npo1.nl', radio: false };

    it('fetches just that channel when nothing covers it yet', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
            tick();
            await storage.bulkPut('playlists', [PLAYLIST], (r) => r.id);
            setRows([ROW]);

            const url = apiUrl(SOURCE, 'get_short_epg', '&stream_id=1359&limit=12');
            http.onGet(url).reply({
                kind: 'ok',
                body: JSON.stringify({ epg_listings: [{ epg_id: 'npo1.nl', title: btoa('Nieuws'), start_timestamp: Math.floor(START / 1000), stop_timestamp: Math.floor(STOP / 1000) }] }),
            });

            expect(await ensureChannelEpg(ROW)).toBe(true);
            tick();
            const channels = get<GuideChannel[]>(GUIDE_CHANNELS) ?? [];
            // The synthesized channel row takes its name from the playlist,
            // since get_short_epg returns programmes but no <channel>.
            expect(channels[0]?.displayName).toBe('NPO 1');
            expect(channels[0]?.programs[0]?.title).toBe('Nieuws');
        });
    });

    it('does nothing when the channel already has programmes', async () => {
        await withFakePlatform({}, async () => {
            setEpgProgramIndex(new Map([['npo1.nl', [{ channelId: 'npo1.nl', start: START, stop: STOP, title: 'Already here', description: null }]]]));
            expect(await ensureChannelEpg(ROW)).toBe(false);
        });
    });

    it('skips a row with no epg id — there is no key a panel could answer for', async () => {
        await withFakePlatform({}, async () => {
            expect(await ensureChannelEpg({ ...ROW, tvgId: null })).toBe(false);
        });
    });

    it('asks only once per channel per session, however often it is replayed', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initGuideState();
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
            tick();
            await storage.bulkPut('playlists', [PLAYLIST], (r) => r.id);
            setRows([ROW]);
            http.onGet(apiUrl(SOURCE, 'get_short_epg', '&stream_id=1359&limit=12')).reply({ kind: 'ok', body: JSON.stringify({ epg_listings: [] }) });

            await ensureChannelEpg(ROW);
            const afterFirst = http.calls.length;
            await ensureChannelEpg(ROW);
            expect(http.calls.length).toBe(afterFirst);
        });
    });
});
