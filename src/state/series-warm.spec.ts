import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { resetSearchActionsForTests } from './search.actions';
import { get } from './typed';
import { selectSeriesCategory } from './series.actions';
import { initSeriesState, SERIES_COUNT, SERIES_WARM_STATUS } from './series';
import { resetSeriesMemoryForTests, seriesMemory } from './series-rows';
import { resetSeriesWarmForTests, warmSeriesCatalog } from './series-warm';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function seedWarmRoutes(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, 'get_series_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { category_id: '1', category_name: 'Drama' },
            { category_id: '2', category_name: 'Sci-Fi' },
        ]),
    });
    http.onGet(apiUrl(source, 'get_series')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { series_id: 1, name: 'Show One', category_id: '1' },
            { series_id: 2, name: 'Show Two', category_id: '2' },
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

describe('warmSeriesCatalog()', () => {
    afterEach(() => {
        resetSeriesMemoryForTests();
        resetSeriesWarmForTests();
        resetSearchActionsForTests();
        resetPersistForTests();
        resetState();
    });

    it('skips on a non-full storage tier, making no request', async () => {
        await withFakePlatform({ durableStorage: 'none' }, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);

            await warmSeriesCatalog();
            tick();

            expect(get<string>(SERIES_WARM_STATUS)).toBe('skipped');
            expect(http.calls).toHaveLength(0);
        });
    });

    it('populates memory + storage so a later selectSeriesCategory never refetches', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            seedWarmRoutes(http);

            await warmSeriesCatalog();
            tick();

            expect(get<string>(SERIES_WARM_STATUS)).toBe('warmed');
            expect(http.calls).toHaveLength(2);

            await selectSeriesCategory('2');
            tick();

            expect(http.calls).toHaveLength(2);
            expect(get<number>(SERIES_COUNT)).toBe(1);
        });
    });

    it('is a no-op when the warm is already fresh', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);
            seedWarmRoutes(http);

            await warmSeriesCatalog();
            tick();
            await warmSeriesCatalog();
            tick();

            expect(http.calls).toHaveLength(2);
            expect(get<string>(SERIES_WARM_STATUS)).toBe('warmed');
        });
    });

    it('discards the result and stays in lazy mode past the sanity cap', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initSeriesState();
            await activateXtreamSource(storage);

            http.onGet(apiUrl(source, 'get_series_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'Drama' }]),
            });
            const huge = Array.from({ length: 100_001 }, (_, i) => ({ series_id: i, name: `Show ${String(i)}`, category_id: '1' }));
            http.onGet(apiUrl(source, 'get_series')).reply({ kind: 'ok', body: JSON.stringify(huge) });

            await warmSeriesCatalog();
            tick();

            expect(get<string>(SERIES_WARM_STATUS)).toBe('skipped');
            expect(seriesMemory.categoriesFetchedAt()).toBeNull();
        });
    });
});
