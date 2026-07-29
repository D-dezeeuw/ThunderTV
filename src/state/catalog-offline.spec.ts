import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { LIST_VISIBLE_ROWS } from './list';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { initSeriesState, SERIES_STALE, SERIES_STATUS } from './series';
import { resetSeriesMemoryForTests } from './series-rows';
import { openSeriesCatalog, republishSeriesRows } from './series.actions';
import { get } from './typed';
import { initVodState, VOD_COUNT, VOD_STALE, VOD_STATUS } from './vod';
import { resetVodMemoryForTests } from './vod-rows';
import { openVodCatalog, republishVodRows } from './vod.actions';

/**
 * Two behaviours that only show up when you leave the happy path.
 *
 * **Offline browsing.** Every catalog read is memory → storage → network,
 * but the storage hop used to be gated on the TTL: a cache older than that
 * was skipped entirely, so a failed refresh produced an error screen with a
 * complete catalog sitting unused in IndexedDB. A stale cache is now adopted
 * and the failure is reported as `stale`, not as an error.
 *
 * **The shared list.** Live, Categories, Movies, Series and Search all
 * publish into one virtual list, so switching INTO a view has to republish
 * or the previous view's rows stay on screen.
 */
const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };
/** Older than CATALOG_TTL_MS, so every freshness check treats it as expired. */
const LONG_AGO = 1;

async function activate(storage: MemoryStorage): Promise<void> {
    await storage.bulkPut(
        'playlists',
        [makePlaylistRecord({ id: 'src-1', type: 'xtream', url: source.url, username: source.user, password: source.pass })],
        (r) => r.id,
    );
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
    tick();
}

/** Seeds the full-tier storage cache directly, exactly as a previous online session would have left it. */
async function seedStaleVodCache(storage: MemoryStorage): Promise<void> {
    await storage.set('vod.catalog.categories', {
        fetchedAt: LONG_AGO,
        categories: [{ id: '1', name: 'ACTION' }],
    });
    await storage.set('vod.catalog.items.1', {
        fetchedAt: LONG_AGO,
        items: [
            { streamId: 10, name: 'Cached Movie', categoryId: '1', containerExtension: 'mkv', searchKey: 'cached movie' },
        ],
    });
}

afterEach(() => {
    resetVodMemoryForTests();
    resetSeriesMemoryForTests();
    resetPersistForTests();
    resetState();
});

describe('catalog offline fallback', () => {
    it('browses a stale cached catalog when the provider cannot be reached, and says so', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activate(storage);
            await seedStaleVodCache(storage);
            // Both calls fail — this is the offline case, not a partial outage.
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({ kind: 'cors-or-network' });
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({ kind: 'cors-or-network' });

            await openVodCatalog();
            tick();

            // The network really was attempted and really did fail — without
            // this the test would also pass if the cache had been treated as
            // fresh, which is the branch that already worked.
            expect(http.calls.map((call) => call.url)).toContain(apiUrl(source, 'get_vod_categories'));
            expect(get<string>(VOD_STATUS)).toBe('ready');
            expect(get<boolean>(VOD_STALE)).toBe(true);
            expect(get<number>(VOD_COUNT)).toBe(1);
            const rows = get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? [];
            expect(rows.map((row) => row.name)).toEqual(['Cached Movie']);
        });
    });

    it('still errors when there is no cache to fall back on', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activate(storage);
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({ kind: 'cors-or-network' });

            await openVodCatalog();
            tick();

            expect(get<string>(VOD_STATUS)).toBe('error');
            expect(get<boolean>(VOD_STALE)).toBe(false);
        });
    });

    it('clears the stale flag once a refresh succeeds', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            await activate(storage);
            await seedStaleVodCache(storage);
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'ACTION' }]),
            });
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 10, name: 'Live Movie', category_id: '1', container_extension: 'mkv' }]),
            });

            await openVodCatalog();
            tick();

            expect(get<boolean>(VOD_STALE)).toBe(false);
            expect(get<string>(VOD_STATUS)).toBe('ready');
        });
    });

    it('falls back for TV Shows on the same terms', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initSeriesState();
            await activate(storage);
            await storage.set('series.catalog.categories', {
                fetchedAt: LONG_AGO,
                categories: [{ id: '1', name: 'DRAMA' }],
            });
            await storage.set('series.catalog.items.1', {
                fetchedAt: LONG_AGO,
                items: [{ seriesId: 7, name: 'Cached Show', categoryId: '1', searchKey: 'cached show' }],
            });
            http.onGet(apiUrl(source, 'get_series_categories')).reply({ kind: 'cors-or-network' });
            http.onGet(apiUrl(source, 'get_series', '&category_id=1')).reply({ kind: 'cors-or-network' });

            await openSeriesCatalog();
            tick();

            expect(get<string>(SERIES_STATUS)).toBe('ready');
            expect(get<boolean>(SERIES_STALE)).toBe(true);
        });
    });

    it('does not persist the catalog cache below the full storage tier, so nothing is there to fall back to', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async ({ http, storage }) => {
            initVodState();
            await activate(storage);
            await seedStaleVodCache(storage);
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({ kind: 'cors-or-network' });

            await openVodCatalog();
            tick();

            // A quota-constrained tier is deliberately never asked to hold a
            // multi-thousand-item catalog (`catalog-storage.ts`), so offline
            // browsing is a full-tier feature and fails honestly elsewhere.
            expect(get<string>(VOD_STATUS)).toBe('error');
        });
    });
});

describe('switching between catalog tabs', () => {
    it('republishes the open category rows without re-running the auto-select', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSeriesState();
            await activate(storage);
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([
                    { category_id: '1', category_name: 'ACTION' },
                    { category_id: '2', category_name: 'COMEDY' },
                ]),
            });
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 10, name: 'Movie A', category_id: '1', container_extension: 'mkv' }]),
            });
            http.onGet(apiUrl(source, 'get_series_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '9', category_name: 'DRAMA' }]),
            });
            http.onGet(apiUrl(source, 'get_series', '&category_id=9')).reply({
                kind: 'ok',
                body: JSON.stringify([{ series_id: 7, name: 'Show B', category_id: '9' }]),
            });

            await openVodCatalog();
            tick();
            expect((get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? []).map((r) => r.name)).toEqual(['Movie A']);

            // The TV Shows tab takes the shared list over…
            await openSeriesCatalog();
            tick();
            expect((get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? []).map((r) => r.name)).toEqual(['Show B']);

            // …and switching back must hand it straight back, from memory,
            // with no second network call.
            const callsBefore = http.calls.length;
            expect(republishVodRows()).toBe(true);
            tick();
            expect((get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? []).map((r) => r.name)).toEqual(['Movie A']);
            expect(http.calls).toHaveLength(callsBefore);

            expect(republishSeriesRows()).toBe(true);
            tick();
            expect((get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? []).map((r) => r.name)).toEqual(['Show B']);
            expect(http.calls).toHaveLength(callsBefore);
        });
    });

    it('reports false when nothing is cached, so the caller falls back to a real open', async () => {
        await withFakePlatform({ durableStorage: 'full' }, () => {
            initVodState();
            initSeriesState();
            expect(republishVodRows()).toBe(false);
            expect(republishSeriesRows()).toBe(false);
        });
    });
});
