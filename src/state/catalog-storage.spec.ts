import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import {
    loadStoredCategories,
    loadStoredDetail,
    loadStoredItems,
    loadStoredWarmMeta,
    saveStoredCategories,
    saveStoredDetail,
    saveStoredItems,
    saveStoredWarmMeta,
} from './catalog-storage';

describe('catalog-storage (full tier only)', () => {
    it('round-trips categories/items/detail on the full tier', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async () => {
            await saveStoredCategories('vod', { fetchedAt: 1, categories: [{ id: '1', name: 'Action' }] });
            expect(await loadStoredCategories('vod')).toEqual({ fetchedAt: 1, categories: [{ id: '1', name: 'Action' }] });

            await saveStoredItems('vod', '1', { fetchedAt: 2, items: [{ streamId: 9 }] });
            expect(await loadStoredItems('vod', '1')).toEqual({ fetchedAt: 2, items: [{ streamId: 9 }] });

            await saveStoredDetail('vod', 9, { fetchedAt: 3, data: { plot: 'x' } });
            expect(await loadStoredDetail('vod', 9)).toEqual({ fetchedAt: 3, data: { plot: 'x' } });
        });
    });

    it('is a no-op read/write on the partial tier (session-memory-only)', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async () => {
            await saveStoredCategories('vod', { fetchedAt: 1, categories: [] });
            expect(await loadStoredCategories('vod')).toBeUndefined();
        });
    });

    it('is a no-op read/write on the none tier', async () => {
        await withFakePlatform({ durableStorage: 'none' }, async () => {
            await saveStoredItems('series', '1', { fetchedAt: 1, items: [] });
            expect(await loadStoredItems('series', '1')).toBeUndefined();
        });
    });

    it('round-trips warm-meta (category ids only, no items) on the full tier', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async () => {
            expect(await loadStoredWarmMeta('vod')).toBeUndefined();
            await saveStoredWarmMeta('vod', { fetchedAt: 5, categoryIds: ['1', '2'] });
            expect(await loadStoredWarmMeta('vod')).toEqual({ fetchedAt: 5, categoryIds: ['1', '2'] });
        });
    });

    it('warm-meta is a no-op on the partial/none tiers', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async () => {
            await saveStoredWarmMeta('vod', { fetchedAt: 5, categoryIds: ['1'] });
            expect(await loadStoredWarmMeta('vod')).toBeUndefined();
        });
    });

    it('keeps vod/series payloads under separate keys via the prefix', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async () => {
            await saveStoredCategories('vod', { fetchedAt: 1, categories: [{ id: '1', name: 'Vod' }] });
            await saveStoredCategories('series', { fetchedAt: 2, categories: [{ id: '1', name: 'Series' }] });

            expect((await loadStoredCategories('vod'))?.categories[0]?.name).toBe('Vod');
            expect((await loadStoredCategories('series'))?.categories[0]?.name).toBe('Series');
        });
    });
});
