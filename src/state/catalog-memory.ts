import type { XtreamCategory } from '../xtream/types';

/**
 * Parameterized module-memory core shared by the VOD and series catalogs
 * (`src/state/README.md`'s "Bulk-data bypass rules") — a category's item
 * list can run into the thousands, so it lives here in plain memory, never
 * as a Spektrum value, exactly like `src/m3u/channel-memory.ts`'s
 * `allRows`. `vod-rows.ts`/`series-rows.ts` each create one instance via
 * `createCatalogMemory()`, parameterized only by how to read an item's
 * numeric id — everything else (categories, per-category items, a per-item
 * detail cache, TTL bookkeeping) is identical shape for both catalogs, so
 * one generic core replaces what would otherwise be two near-identical
 * copies.
 */
export interface CatalogMemory<TItem, TDetail> {
    categories: () => readonly XtreamCategory[];
    setCategories: (categories: readonly XtreamCategory[]) => void;
    categoriesFetchedAt: () => number | null;
    setCategoriesFetchedAt: (fetchedAt: number) => void;

    /** `undefined` means "never fetched" — distinct from an empty (but fetched) category. */
    itemsFor: (categoryId: string) => readonly TItem[] | undefined;
    itemsFetchedAt: (categoryId: string) => number | null;
    setItemsFor: (categoryId: string, items: readonly TItem[], fetchedAt: number) => void;
    /** Every item across every category fetched so far — the search scopes' read source (`search.actions.ts`), never the full provider catalog unless the user has actually opened every category. */
    allItems: () => readonly TItem[];
    findItem: (id: number) => TItem | undefined;
    /** True when categories haven't been fetched at all yet, or at least one known category's items haven't — drives `search.loadedOnly`. */
    hasUnfetchedCategories: () => boolean;

    detail: (id: number) => TDetail | undefined;
    detailFetchedAt: (id: number) => number | null;
    setDetail: (id: number, data: TDetail, fetchedAt: number) => void;

    /** Test-only / source-switch reset. */
    reset: () => void;
}

interface ItemsBucket<TItem> {
    items: TItem[];
    fetchedAt: number;
}

interface DetailEntry<TDetail> {
    data: TDetail;
    fetchedAt: number;
}

export function createCatalogMemory<TItem, TDetail>(getId: (item: TItem) => number): CatalogMemory<TItem, TDetail> {
    let categories: XtreamCategory[] = [];
    let categoriesFetchedAt: number | null = null;
    const itemsByCategory = new Map<string, ItemsBucket<TItem>>();
    const itemIndex = new Map<number, TItem>();
    const details = new Map<number, DetailEntry<TDetail>>();

    function rebuildIndex(): void {
        itemIndex.clear();
        for (const bucket of itemsByCategory.values()) {
            for (const item of bucket.items) itemIndex.set(getId(item), item);
        }
    }

    return {
        categories: () => categories,
        setCategories: (next) => {
            categories = [...next];
        },
        categoriesFetchedAt: () => categoriesFetchedAt,
        setCategoriesFetchedAt: (fetchedAt) => {
            categoriesFetchedAt = fetchedAt;
        },

        itemsFor: (categoryId) => itemsByCategory.get(categoryId)?.items,
        itemsFetchedAt: (categoryId) => itemsByCategory.get(categoryId)?.fetchedAt ?? null,
        setItemsFor: (categoryId, items, fetchedAt) => {
            itemsByCategory.set(categoryId, { items: [...items], fetchedAt });
            rebuildIndex();
        },
        allItems: () => [...itemIndex.values()],
        findItem: (id) => itemIndex.get(id),
        hasUnfetchedCategories: () =>
            categoriesFetchedAt === null || categories.some((c) => !itemsByCategory.has(c.id)),

        detail: (id) => details.get(id)?.data,
        detailFetchedAt: (id) => details.get(id)?.fetchedAt ?? null,
        setDetail: (id, data, fetchedAt) => {
            details.set(id, { data, fetchedAt });
        },

        reset: () => {
            categories = [];
            categoriesFetchedAt = null;
            itemsByCategory.clear();
            itemIndex.clear();
            details.clear();
        },
    };
}
