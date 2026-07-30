import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { resetPersistForTests } from './persist';
import { PLAYER_ACTIVE } from './player';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import type { ActiveChannelSnapshot } from './records';
import { get } from './typed';
import { openVodCatalog, openVodDetail, playVod, selectVodCategory } from './vod.actions';
import { initVodState, VOD_CATEGORIES, VOD_COUNT, VOD_DETAIL_ID, VOD_ERROR_REASON, VOD_STATUS, type VodCategoryRow } from './vod';
import { resetVodMemoryForTests } from './vod-rows';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function seedActiveXtreamSource(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, 'get_vod_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { category_id: '1', category_name: 'US | ACTION' },
            { category_id: '2', category_name: 'NL | FILMS' },
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

describe('vod.actions', () => {
    afterEach(() => {
        resetVodMemoryForTests();
        resetPersistForTests();
        resetState();
    });

    it('sets status error/no-source when there is no active, fully-credentialed Xtream account', async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            await openVodCatalog();
            tick();

            expect(get<string>(VOD_STATUS)).toBe('error');
            expect(get<string | null>(VOD_ERROR_REASON)).toBe('no-source');
        });
    });

    it('fetches categories, sorts NL first, and auto-selects + publishes the first category\'s items', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            seedActiveXtreamSource(http);
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=2')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 10, name: 'Movie A', category_id: '2', container_extension: 'mp4' }]),
            });

            await openVodCatalog();
            tick();

            const categories = get<VodCategoryRow[]>(VOD_CATEGORIES);
            expect(categories?.map((c) => c.id)).toEqual(['2', '1']);
            expect(get<string>(VOD_STATUS)).toBe('ready');
            expect(get<number>(VOD_COUNT)).toBe(1);
        });
    });

    it('strips a leading provider decoration tag from published category names (Issue 1)', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: '| NL | TOP 100' }]),
            });
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({ kind: 'ok', body: JSON.stringify([]) });

            await openVodCatalog();
            tick();

            const categories = get<VodCategoryRow[]>(VOD_CATEGORIES);
            // A category nothing else groups with publishes as a plain,
            // triangle-less head row (`catalog-category-tree.ts`).
            expect(categories).toEqual([
                { id: '1', name: 'TOP 100', hasVariants: false, expanded: false, variant: false },
            ]);
        });
    });

    it('caches a selected category within the TTL — a second selectCategory call does not refetch', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 5, name: 'Movie B', category_id: '1', container_extension: 'mkv' }]),
            });

            await selectVodCategory('1');
            tick();
            expect(http.calls).toHaveLength(1);
            expect(get<number>(VOD_COUNT)).toBe(1);
            expect(get<string>(VOD_STATUS)).toBe('ready');

            await selectVodCategory('1');
            tick();
            expect(http.calls).toHaveLength(1); // still just the one network call — served from module memory
            expect(get<number>(VOD_COUNT)).toBe(1);
        });
    });

    it('closes the detail panel on play, so it does not cover the player pane it opens', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 5, name: 'Movie B', category_id: '1', container_extension: 'mkv' }]),
            });
            http.onGet(apiUrl(source, 'get_vod_info', '&vod_id=5')).reply({ kind: 'http', status: 500 });

            await selectVodCategory('1');
            tick();
            await openVodDetail(5);
            tick();
            expect(get<number | null>(VOD_DETAIL_ID)).toBe(5);

            await playVod(5);
            tick();

            expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.kind).toBe('vod');
            expect(get<number | null>(VOD_DETAIL_ID)).toBeNull();
        });
    });

    it('sets status error/fetch-failed when get_vod_streams fails', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initVodState();
            await activateXtreamSource(storage);
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({ kind: 'http', status: 500 });

            await selectVodCategory('1');
            tick();

            expect(get<string>(VOD_STATUS)).toBe('error');
            expect(get<string | null>(VOD_ERROR_REASON)).toBe('fetch-failed');
        });
    });
});
