import type { XtreamCategory } from '../xtream/types';
import { loadStoredCategories, loadStoredItems, saveStoredCategories, saveStoredItems, saveStoredWarmMeta } from './catalog-storage';
import type { CatalogMemory } from './catalog-memory';

/**
 * Shared bookkeeping for the VOD/series background full-catalog warm
 * (`vod-warm.ts`/`series-warm.ts`) — the part that's identical either way,
 * so those two files stay thin wrappers around their own network call and
 * the `>WARM_ROW_CAP` sanity decision, exactly the same "one parameterized
 * core, thin per-catalog wrapper" shape as `catalog-memory.ts`/
 * `catalog-sort.ts`/`catalog-storage.ts`.
 */

/**
 * A `get_vod_streams`/`get_series` dump this large is far past what any
 * real "browse the whole catalog" screen needs and risks holding an
 * unreasonable amount in memory/storage for a single warm pass — treated as
 * a signal the provider's "no category id" quirk returned something
 * degenerate (e.g. every historical VOD entry a multi-tenant panel has ever
 * served) rather than a normal catalog. `vod-warm.ts`/`series-warm.ts`
 * discard the result and stay in lazy (per-category, on-demand) mode when
 * this is exceeded — see their own header for the full decision.
 */
export const WARM_ROW_CAP = 100_000;

export type WarmStatus = 'idle' | 'warming' | 'warmed' | 'skipped';

/**
 * Buckets already-normalized items by `categoryId`, seeding an entry for
 * every *known* category id (even one with zero items) — the exact shape
 * `CatalogMemory.hasUnfetchedCategories()` needs to become `false` for the
 * whole catalog, not just the categories that happened to have items. An
 * item whose `categoryId` isn't in `categoryIds` (the `'uncategorized'`
 * fallback bucket, `client.ts`'s normalize boundary) still gets its own
 * bucket — extra, honest search coverage, harmless to
 * `hasUnfetchedCategories()` since that only iterates known categories.
 */
export function groupWarmedItems<TItem>(
    items: readonly TItem[],
    categoryIds: readonly string[],
    getCategoryId: (item: TItem) => string,
): Map<string, TItem[]> {
    const byCategory = new Map<string, TItem[]>();
    for (const id of categoryIds) byCategory.set(id, []);
    for (const item of items) {
        const id = getCategoryId(item);
        const bucket = byCategory.get(id);
        if (bucket) bucket.push(item);
        else byCategory.set(id, [item]);
    }
    return byCategory;
}

/**
 * Populates module memory and the full-tier storage cache from a freshly
 * fetched, already-grouped full catalog. Storage writes are fire-and-forget
 * (`void`), same as every other lazy-fetch write in `vod.actions.ts`/
 * `series.actions.ts` — a failed persist here only costs a future re-warm,
 * never breaks the in-session memory the caller is about to search over.
 */
export function commitWarmedCatalog<TItem, TDetail>(
    prefix: string,
    memory: CatalogMemory<TItem, TDetail>,
    categories: readonly XtreamCategory[],
    itemsByCategory: ReadonlyMap<string, readonly TItem[]>,
    now: number,
): void {
    memory.setCategories(categories);
    memory.setCategoriesFetchedAt(now);
    void saveStoredCategories(prefix, { fetchedAt: now, categories: categories.map((c) => ({ id: c.id, name: c.name })) });

    for (const [categoryId, items] of itemsByCategory) {
        memory.setItemsFor(categoryId, items, now);
        void saveStoredItems(prefix, categoryId, { items: [...items], fetchedAt: now });
    }

    memory.setWarmedAt(now);
    void saveStoredWarmMeta(prefix, { fetchedAt: now, categoryIds: categories.map((c) => c.id) });
}

/**
 * After a reload, if a previous warm is still fresh (per the persisted
 * warm-meta marker) but this session's module memory is empty, reloads the
 * category list and every category's items back into memory from the
 * full-tier storage cache — local reads only, never the network. Bounded by
 * the category count (a few hundred at most, `VOD_CATEGORIES_CAP`/
 * `SERIES_CATEGORIES_CAP`), each a single small-keyed read.
 */
export async function rehydrateWarmedCatalog<TItem, TDetail>(
    prefix: string,
    memory: CatalogMemory<TItem, TDetail>,
    warmedAt: number,
): Promise<void> {
    const storedCategories = await loadStoredCategories(prefix);
    if (storedCategories) {
        memory.setCategories(storedCategories.categories);
        memory.setCategoriesFetchedAt(storedCategories.fetchedAt);
    }

    await Promise.all(
        memory.categories().map(async (category) => {
            if (memory.itemsFor(category.id)) return; // already populated this session
            const stored = await loadStoredItems<TItem>(prefix, category.id);
            if (stored) memory.setItemsFor(category.id, stored.items, stored.fetchedAt);
        }),
    );

    memory.setWarmedAt(warmedAt);
}
