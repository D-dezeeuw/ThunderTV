import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { createCatalogMemory } from './catalog-memory';
import { commitWarmedCatalog, groupWarmedItems, rehydrateWarmedCatalog } from './catalog-warm';

interface Item {
    id: number;
    categoryId: string;
}

describe('groupWarmedItems()', () => {
    it('seeds an empty bucket for every known category id, even one with zero items', () => {
        const items: Item[] = [{ id: 1, categoryId: 'a' }];
        const byCategory = groupWarmedItems(items, ['a', 'b'], (i) => i.categoryId);
        expect([...byCategory.keys()].sort()).toEqual(['a', 'b']);
        expect(byCategory.get('b')).toEqual([]);
    });

    it('still buckets an item whose categoryId is not in the known category list (e.g. "uncategorized")', () => {
        const items: Item[] = [{ id: 1, categoryId: 'uncategorized' }];
        const byCategory = groupWarmedItems(items, ['a'], (i) => i.categoryId);
        expect(byCategory.get('uncategorized')).toEqual([{ id: 1, categoryId: 'uncategorized' }]);
        expect(byCategory.get('a')).toEqual([]);
    });
});

describe('commitWarmedCatalog() / rehydrateWarmedCatalog()', () => {
    it('populates memory and marks hasUnfetchedCategories() false for every known category', async () => {
        // Wrapped in a fake platform even though this test only asserts on
        // memory — commitWarmedCatalog() fire-and-forgets its storage writes
        // (`void saveStored*`), which would otherwise throw "getPlatform()
        // called before setPlatform()" as unhandled rejections.
        await withFakePlatform({ durableStorage: 'full' }, () => {
            const memory = createCatalogMemory<Item, string>((i) => i.id);
            const byCategory = groupWarmedItems<Item>([{ id: 1, categoryId: 'a' }], ['a', 'b'], (i) => i.categoryId);

            commitWarmedCatalog('vod', memory, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], byCategory, 1_000);

            expect(memory.hasUnfetchedCategories()).toBe(false);
            expect(memory.findItem(1)).toEqual({ id: 1, categoryId: 'a' });
            expect(memory.itemsFor('b')).toEqual([]);
            expect(memory.warmedAt()).toBe(1_000);
        });
    });

    it('persists categories/items/warm-meta to full-tier storage', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ storage }) => {
            const memory = createCatalogMemory<Item, string>((i) => i.id);
            const byCategory = groupWarmedItems<Item>([{ id: 1, categoryId: 'a' }], ['a'], (i) => i.categoryId);
            commitWarmedCatalog('vod', memory, [{ id: 'a', name: 'A' }], byCategory, 1_000);

            // void-fired writes — allow the microtask queue to flush.
            await Promise.resolve();
            await Promise.resolve();

            expect(await storage.get('vod.catalog.categories')).toEqual({ fetchedAt: 1_000, categories: [{ id: 'a', name: 'A' }] });
            expect(await storage.get('vod.catalog.items.a')).toEqual({ fetchedAt: 1_000, items: [{ id: 1, categoryId: 'a' }] });
            expect(await storage.get('vod.catalog.warm')).toEqual({ fetchedAt: 1_000, categoryIds: ['a'] });
        });
    });

    it('rehydrates a fresh session-memory-empty catalog from full-tier storage, without any network involved', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async () => {
            const writer = createCatalogMemory<Item, string>((i) => i.id);
            const byCategory = groupWarmedItems<Item>(
                [{ id: 1, categoryId: 'a' }, { id: 2, categoryId: 'b' }],
                ['a', 'b'],
                (i) => i.categoryId,
            );
            commitWarmedCatalog('vod', writer, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], byCategory, 1_000);
            await Promise.resolve();
            await Promise.resolve();

            // Simulate a reload: a brand-new, empty in-memory instance.
            const reader = createCatalogMemory<Item, string>((i) => i.id);
            expect(reader.hasUnfetchedCategories()).toBe(true);

            await rehydrateWarmedCatalog('vod', reader, 1_000);

            expect(reader.warmedAt()).toBe(1_000);
            expect(reader.hasUnfetchedCategories()).toBe(false);
            expect(reader.findItem(1)).toEqual({ id: 1, categoryId: 'a' });
            expect(reader.findItem(2)).toEqual({ id: 2, categoryId: 'b' });
        });
    });

    it('rehydrate skips a category already populated this session', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async () => {
            const writer = createCatalogMemory<Item, string>((i) => i.id);
            const byCategory = groupWarmedItems<Item>([{ id: 1, categoryId: 'a' }], ['a'], (i) => i.categoryId);
            commitWarmedCatalog('vod', writer, [{ id: 'a', name: 'A' }], byCategory, 1_000);
            await Promise.resolve();
            await Promise.resolve();

            const reader = createCatalogMemory<Item, string>((i) => i.id);
            reader.setItemsFor('a', [{ id: 99, categoryId: 'a' }], 500); // already has its own (older) items this session

            await rehydrateWarmedCatalog('vod', reader, 1_000);

            // Not overwritten by the stored snapshot — rehydrate only fills gaps.
            expect(reader.findItem(99)).toEqual({ id: 99, categoryId: 'a' });
            expect(reader.findItem(1)).toBeUndefined();
        });
    });
});
