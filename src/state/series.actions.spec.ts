import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { get } from './typed';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { PLAYER_ACTIVE } from './player';
import type { ActiveChannelSnapshot } from './records';
import {
    openSeriesCatalog,
    openSeriesDetail,
    playSeriesEpisode,
    selectSeriesCategory,
} from './series.actions';
import {
    initSeriesState,
    SERIES_CATEGORIES,
    SERIES_COUNT,
    SERIES_DETAIL,
    SERIES_DETAIL_ID,
    SERIES_ERROR_REASON,
    SERIES_STATUS,
    type SeriesCategoryRow,
    type SeriesDetail,
} from './series';
import { resetSeriesMemoryForTests } from './series-rows';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function seedSeriesCategories(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, 'get_series_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { category_id: '1', category_name: 'US | DRAMA' },
            { category_id: '2', category_name: 'NL | SERIES' },
        ]),
    });
}

async function activateXtreamSource(storage: MemoryStorage): Promise<void> {
    await storage.bulkPut(
        'playlists',
        [makePlaylistRecord({ id: 'src-1', type: 'xtream', url: source.url, username: source.user, password: source.pass })],
        (r) => r.id,
    );
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
    tick();
}

describe('series.actions', () => {
    afterEach(() => {
        resetSeriesMemoryForTests();
        resetPersistForTests();
        resetState();
    });

    it('sets status error/no-source when there is no active Xtream account', async () => {
        await withFakePlatform({}, async () => {
            initSeriesState();
            await openSeriesCatalog();
            tick();

            expect(get<string>(SERIES_STATUS)).toBe('error');
            expect(get<string | null>(SERIES_ERROR_REASON)).toBe('no-source');
        });
    });

    it('fetches categories, sorts NL first, and auto-selects + publishes the first category\'s series', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            seedSeriesCategories(http);
            http.onGet(apiUrl(source, 'get_series', '&category_id=2')).reply({
                kind: 'ok',
                body: JSON.stringify([{ series_id: 42, name: 'Show A', category_id: '2' }]),
            });

            await openSeriesCatalog();
            tick();

            const categories = get<SeriesCategoryRow[]>(SERIES_CATEGORIES);
            expect(categories?.map((c) => c.id)).toEqual(['2', '1']);
            expect(get<string>(SERIES_STATUS)).toBe('ready');
            expect(get<number>(SERIES_COUNT)).toBe(1);
        });
    });

    it('caches a selected category within the TTL — a second selectCategory call does not refetch', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_series', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ series_id: 7, name: 'Show B', category_id: '1' }]),
            });

            await selectSeriesCategory('1');
            tick();
            expect(http.calls).toHaveLength(1);

            await selectSeriesCategory('1');
            tick();
            expect(http.calls).toHaveLength(1);
        });
    });

    it('openSeriesDetail publishes a partial snapshot immediately, then fills in seasons/episodes', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_series', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ series_id: 7, name: 'Show B', category_id: '1', cover: 'cover.jpg' }]),
            });
            http.onGet(apiUrl(source, 'get_series_info', '&series_id=7')).reply({
                kind: 'ok',
                body: JSON.stringify({
                    episodes: { '1': [{ id: 100, episode_num: 1, title: 'Pilot', container_extension: 'mp4' }] },
                }),
            });

            await selectSeriesCategory('1');
            tick();
            await openSeriesDetail(7);
            tick();

            const detail = get<SeriesDetail>(SERIES_DETAIL);
            expect(detail?.name).toBe('Show B');
            expect(detail?.seasons).toEqual([
                { season: 1, episodes: [{ episodeId: 100, episode: 1, title: 'Pilot', containerExtension: 'mp4', durationSecs: null }] },
            ]);
        });
    });

    it('playSeriesEpisode finds the episode, builds its URL, and hands off to setActiveChannel with kind "series"', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_series', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ series_id: 7, name: 'Show B', category_id: '1' }]),
            });
            http.onGet(apiUrl(source, 'get_series_info', '&series_id=7')).reply({
                kind: 'ok',
                body: JSON.stringify({
                    episodes: { '1': [{ id: 100, episode_num: 1, title: 'Pilot', container_extension: 'mp4' }] },
                }),
            });

            await selectSeriesCategory('1');
            tick();
            await openSeriesDetail(7);
            tick();
            await playSeriesEpisode(7, 100);
            tick();

            const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE);
            expect(active?.name).toBe('Pilot');
            expect(active?.kind).toBe('series');
            expect(active?.streamUrl).toBe(`${source.url}/series/${source.user}/${source.pass}/100.mp4`);
            // The detail panel covers the whole list body, player pane
            // included — leaving it open hides the episode you just started.
            expect(get<number | null>(SERIES_DETAIL_ID)).toBeNull();
        });
    });
});
