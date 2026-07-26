import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { ChannelRow } from '../m3u/types';
import { resetVirtualListForTests, setRows } from '../ui/virtual-list';
import { toggleFavoriteById } from './favorites.actions';
import { FAVORITES_IDS, initFavoritesState, type FavoriteIdsMap } from './favorites';
import { initPlaylistState } from './playlist';
import { get } from './typed';

const ROW: ChannelRow = {
    id: 'p1:0',
    name: 'News Channel',
    url: 'https://example.com/news.m3u8',
    group: 'News',
    logo: 'https://example.com/logo.png',
    tvgId: null,
    radio: false,
};

describe('toggleFavoriteById() (Feature 08.8.3/08.8.6/08.8.9)', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetPlatformForTests();
        resetState();
    });

    it('adds a denormalized snapshot with exactly the expected fields on first toggle', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initFavoritesState();
            initPlaylistState();
            tick();
            setRows([ROW]);
            const { setActiveSourceId } = await import('./playlist.actions');
            setActiveSourceId('p1');
            tick();

            await toggleFavoriteById('p1:0');
            tick();

            const rows = await storage.getAll('favorites');
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                v: 1,
                id: 'p1:0',
                name: 'News Channel',
                streamUrl: 'https://example.com/news.m3u8',
                logo: 'https://example.com/logo.png',
                group: 'News',
                sourceId: 'p1',
            });
            expect(typeof rows[0]?.addedAt).toBe('number');

            const ids = get<FavoriteIdsMap>(FAVORITES_IDS);
            expect(ids?.['p1:0']).toBe(true);
        });
    });

    it('removes the snapshot on a second toggle without touching channel rows', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initFavoritesState();
            initPlaylistState();
            tick();
            setRows([ROW]);
            const { setActiveSourceId } = await import('./playlist.actions');
            setActiveSourceId('p1');
            tick();

            await toggleFavoriteById('p1:0');
            tick(); // commits favorites.ids' delta before the second toggle reads it
            await toggleFavoriteById('p1:0');
            tick();

            expect(await storage.getAll('favorites')).toHaveLength(0);
            expect(await storage.count('channels')).toBe(0);
            const ids = get<FavoriteIdsMap>(FAVORITES_IDS);
            expect(ids?.['p1:0']).toBeUndefined();
        });
    });

    it('no-ops for an id not currently in the active view (row not found)', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initFavoritesState();
            initPlaylistState();
            tick();
            setRows([]);

            await toggleFavoriteById('missing-id');

            expect(await storage.getAll('favorites')).toHaveLength(0);
        });
    });

    it('two toggles fired before either has a chance to tick() never corrupt the table into more than one row', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initFavoritesState();
            initPlaylistState();
            tick();
            setRows([ROW]);
            const { setActiveSourceId } = await import('./playlist.actions');
            setActiveSourceId('p1');
            tick();

            // The real double-fire this guards against (a touch long-press
            // whose native `contextmenu` also fires) is prevented one layer
            // up by `wasJustLongPressed()` (see long-press.spec.ts) before
            // `toggleFavoriteById` is even called a second time. This proves
            // the fallback property for calls that *do* both land: without a
            // tick() between them, each reads the same pre-toggle
            // `favorites.ids` snapshot and both add — `bulkPut` upserts by
            // id, so the table still ends up with exactly one row, never two.
            await Promise.all([toggleFavoriteById('p1:0'), toggleFavoriteById('p1:0')]);

            const rows = await storage.getAll('favorites');
            expect(rows.length).toBeLessThanOrEqual(1);
        });
    });
});
