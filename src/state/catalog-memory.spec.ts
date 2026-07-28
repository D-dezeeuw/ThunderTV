import { describe, expect, it } from 'vitest';
import { createCatalogMemory } from './catalog-memory';

interface Item {
    id: number;
    name: string;
}

describe('createCatalogMemory()', () => {
    it('starts empty with unfetched categories and no cached items/detail', () => {
        const memory = createCatalogMemory<Item, string>((item) => item.id);
        expect(memory.categories()).toEqual([]);
        expect(memory.categoriesFetchedAt()).toBeNull();
        expect(memory.hasUnfetchedCategories()).toBe(true);
        expect(memory.itemsFor('1')).toBeUndefined();
        expect(memory.findItem(1)).toBeUndefined();
        expect(memory.detail(1)).toBeUndefined();
    });

    it('indexes items by id across every category for findItem()/allItems()', () => {
        const memory = createCatalogMemory<Item, string>((item) => item.id);
        memory.setCategories([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
        memory.setCategoriesFetchedAt(1_000);
        memory.setItemsFor('a', [{ id: 1, name: 'One' }], 1_000);

        // 'b' is a known category with no items fetched yet.
        expect(memory.hasUnfetchedCategories()).toBe(true);

        memory.setItemsFor('b', [{ id: 2, name: 'Two' }], 1_000);
        expect(memory.hasUnfetchedCategories()).toBe(false);
        expect(memory.findItem(1)?.name).toBe('One');
        expect(memory.findItem(2)?.name).toBe('Two');
        expect(memory.allItems().map((i) => i.id).sort()).toEqual([1, 2]);
    });

    it('re-setting a category replaces its items rather than appending', () => {
        const memory = createCatalogMemory<Item, string>((item) => item.id);
        memory.setItemsFor('a', [{ id: 1, name: 'One' }], 1_000);
        memory.setItemsFor('a', [{ id: 1, name: 'One (updated)' }], 2_000);
        expect(memory.allItems()).toHaveLength(1);
        expect(memory.findItem(1)?.name).toBe('One (updated)');
        expect(memory.itemsFetchedAt('a')).toBe(2_000);
    });

    it('caches a per-item detail payload independently of the category items', () => {
        const memory = createCatalogMemory<Item, string>((item) => item.id);
        expect(memory.detailFetchedAt(1)).toBeNull();
        memory.setDetail(1, 'plot text', 5_000);
        expect(memory.detail(1)).toBe('plot text');
        expect(memory.detailFetchedAt(1)).toBe(5_000);
    });

    it('reset() clears every bucket', () => {
        const memory = createCatalogMemory<Item, string>((item) => item.id);
        memory.setCategories([{ id: 'a', name: 'A' }]);
        memory.setCategoriesFetchedAt(1_000);
        memory.setItemsFor('a', [{ id: 1, name: 'One' }], 1_000);
        memory.setDetail(1, 'plot', 1_000);

        memory.reset();

        expect(memory.categories()).toEqual([]);
        expect(memory.categoriesFetchedAt()).toBeNull();
        expect(memory.itemsFor('a')).toBeUndefined();
        expect(memory.findItem(1)).toBeUndefined();
        expect(memory.detail(1)).toBeUndefined();
    });
});
