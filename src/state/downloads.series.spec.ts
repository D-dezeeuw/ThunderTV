import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { resetDownloadsForTests, startSeriesEpisodeDownload, startVodDownload } from './downloads.actions';
import { DOWNLOADS_ITEMS, episodeBaseName, initDownloadsState, type DownloadEntry } from './downloads';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { initSeriesState } from './series';
import { resetSeriesMemoryForTests } from './series-rows';
import { openSeriesDetail, selectSeriesCategory } from './series.actions';
import { initVodState } from './vod';
import { resetVodMemoryForTests } from './vod-rows';
import { openVodCatalog } from './vod.actions';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

async function activate(storage: MemoryStorage): Promise<void> {
    await storage.bulkPut(
        'playlists',
        [makePlaylistRecord({ id: 'src-1', type: 'xtream', url: source.url, username: source.user, password: source.pass })],
        (r) => r.id,
    );
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
    tick();
}

async function seedMovies(http: FakeHttpAdapter, storage: MemoryStorage): Promise<void> {
    await activate(storage);
    http.onGet(apiUrl(source, 'get_vod_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([{ category_id: '1', category_name: 'ACTION' }]),
    });
    http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
        kind: 'ok',
        body: JSON.stringify([{ stream_id: 10, name: 'Movie A', category_id: '1', container_extension: 'mkv' }]),
    });
    await openVodCatalog();
    tick();
}

async function seedSeries(http: FakeHttpAdapter, storage: MemoryStorage): Promise<void> {
    await activate(storage);
    http.onGet(apiUrl(source, 'get_series', '&category_id=1')).reply({
        kind: 'ok',
        body: JSON.stringify([{ series_id: 7, name: 'Show B', category_id: '1' }]),
    });
    http.onGet(apiUrl(source, 'get_series_info', '&series_id=7')).reply({
        kind: 'ok',
        body: JSON.stringify({
            episodes: {
                '1': [
                    { id: 100, episode_num: 1, title: 'Pilot', container_extension: 'mkv' },
                    { id: 101, episode_num: 2, title: 'Second', container_extension: 'mkv' },
                ],
            },
        }),
    });
    await selectSeriesCategory('1');
    tick();
    await openSeriesDetail(7);
    tick();
}

function items(): DownloadEntry[] {
    return get<DownloadEntry[]>(DOWNLOADS_ITEMS) ?? [];
}

function entry(id: string): DownloadEntry | undefined {
    return items().find((candidate) => candidate.id === id);
}

afterEach(() => {
    resetDownloadsForTests();
    resetSeriesMemoryForTests();
    resetVodMemoryForTests();
    resetPersistForTests();
    resetState();
});

/**
 * A TV episode is the same static-file shape as a movie
 * (`/series/{user}/{pass}/{id}.{ext}`), so it rides the same queue. The one
 * thing worth pinning separately is where its extension comes from: the
 * already-loaded `series.detail.rows`, never a `get_series_info` round trip,
 * because awaiting one would spend the click's user activation before the
 * save picker opened.
 */

describe('episodeBaseName', () => {
    it('zero-pads the season/episode code so a season sorts in order on disk', () => {
        expect(episodeBaseName('Show B', 1, 3, 'Pilot')).toBe('Show B - S01E03 - Pilot');
        expect(episodeBaseName('Show B', 12, 10, 'Finale')).toBe('Show B - S12E10 - Finale');
    });

    it('drops a title that only repeats the episode number, which many providers send', () => {
        expect(episodeBaseName('Show B', 2, 4, '4')).toBe('Show B - S02E04');
        expect(episodeBaseName('Show B', 2, 4, '   ')).toBe('Show B - S02E04');
    });
});

describe('downloads queue — TV episodes', () => {
    it('queues an episode under a series+episode id, named and extensioned from the open detail', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initSeriesState();
            initDownloadsState();
            await seedSeries(http, storage);

            await startSeriesEpisodeDownload(7, 100);
            tick();

            expect(downloads.prepared).toEqual(['Show B - S01E01 - Pilot.mkv']);
            expect(downloads.started[0]?.url).toContain('/series/bob/secret/100.mkv');
            expect(entry('series:7:100')?.status).toBe('downloading');
        });
    });

    it('shares one serial queue with movies rather than running a second one', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initSeriesState();
            initDownloadsState();
            await seedMovies(http, storage);
            await seedSeries(http, storage);

            await startVodDownload(10);
            await startSeriesEpisodeDownload(7, 100);
            tick();

            expect(downloads.started).toHaveLength(1);
            expect(entry('vod:10')?.status).toBe('downloading');
            expect(entry('series:7:100')?.status).toBe('queued');

            downloads.finish();
            tick();
            expect(entry('series:7:100')?.status).toBe('downloading');
        });
    });

    it('queues two episodes of the same show independently', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initSeriesState();
            initDownloadsState();
            await seedSeries(http, storage);

            await startSeriesEpisodeDownload(7, 100);
            await startSeriesEpisodeDownload(7, 101);
            tick();

            expect(items().map((item) => item.id)).toEqual(['series:7:100', 'series:7:101']);
            expect(downloads.prepared).toEqual(['Show B - S01E01 - Pilot.mkv', 'Show B - S01E02 - Second.mkv']);
        });
    });

    it('ignores an episode that is not in the open series detail', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initSeriesState();
            initDownloadsState();
            await seedSeries(http, storage);

            await startSeriesEpisodeDownload(7, 999);
            await startSeriesEpisodeDownload(8, 100);
            tick();

            expect(items()).toEqual([]);
            expect(downloads.prepared).toEqual([]);
        });
    });
});
