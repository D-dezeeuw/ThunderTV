import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { resetSearchActionsForTests, setSearchQuery, setSearchScope } from './search.actions';
import { initSearchState, SEARCH_LOADED_ONLY } from './search';
import { get } from './typed';
import { selectVodCategory } from './vod.actions';
import { initVodState, VOD_COUNT, VOD_WARM_STATUS } from './vod';
import { resetVodMemoryForTests, vodMemory } from './vod-rows';
import { resetVodWarmForTests, warmVodCatalog } from './vod-warm';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function seedWarmRoutes(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, 'get_vod_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { category_id: '1', category_name: 'Action' },
            { category_id: '2', category_name: 'Comedy' },
        ]),
    });
    http.onGet(apiUrl(source, 'get_vod_streams')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { stream_id: 1, name: 'Movie One', category_id: '1', container_extension: 'mp4' },
            { stream_id: 2, name: 'Movie Two', category_id: '2', container_extension: 'mkv' },
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

describe('warmVodCatalog()', () => {
    afterEach(() => {
        resetVodMemoryForTests();
        resetVodWarmForTests();
        resetSearchActionsForTests();
        resetPersistForTests();
        resetState();
    });

    it('skips on a non-full storage tier, making no request', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);

            await warmVodCatalog();
            tick();

            expect(get<string>(VOD_WARM_STATUS)).toBe('skipped');
            expect(http.calls).toHaveLength(0);
        });
    });

    it('populates memory + storage so a later selectVodCategory never refetches', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            seedWarmRoutes(http);

            await warmVodCatalog();
            tick();

            expect(get<string>(VOD_WARM_STATUS)).toBe('warmed');
            expect(http.calls).toHaveLength(2); // get_vod_categories + get_vod_streams (no category id)

            await selectVodCategory('1');
            tick();

            expect(http.calls).toHaveLength(2); // served entirely from the warm — no get_vod_streams&category_id=1 call
            expect(get<number>(VOD_COUNT)).toBe(1);

            const stored = await storage.get('vod.catalog.items.1');
            expect(stored).toBeTruthy();
        });
    });

    it('is a no-op (no new requests) when the warm is already fresh', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            seedWarmRoutes(http);

            await warmVodCatalog();
            tick();
            expect(http.calls).toHaveLength(2);

            await warmVodCatalog();
            tick();

            expect(http.calls).toHaveLength(2); // still just the first warm's two calls
            expect(get<string>(VOD_WARM_STATUS)).toBe('warmed');
        });
    });

    it('discards the result and stays in lazy mode when the full dump exceeds the sanity cap', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);

            http.onGet(apiUrl(source, 'get_vod_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'Action' }]),
            });
            const huge = Array.from({ length: 100_001 }, (_, i) => ({
                stream_id: i,
                name: `Movie ${String(i)}`,
                category_id: '1',
            }));
            http.onGet(apiUrl(source, 'get_vod_streams')).reply({ kind: 'ok', body: JSON.stringify(huge) });

            await warmVodCatalog();
            tick();

            expect(get<string>(VOD_WARM_STATUS)).toBe('skipped');
            expect(vodMemory.categoriesFetchedAt()).toBeNull();
            expect(vodMemory.itemsFor('1')).toBeUndefined();
        });
    });

    it('flips search.loadedOnly from true to false for the movies scope once warmed', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await activateXtreamSource(storage);
            seedWarmRoutes(http);

            setSearchScope('movies');
            setSearchQuery('movie');
            tick();
            expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(true); // nothing loaded yet

            await warmVodCatalog();
            tick();

            expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(false); // warm already re-ran the search
        });
    });
});
