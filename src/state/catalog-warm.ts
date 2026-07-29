import { getPlatform } from '../core/platform';
import { resolveActiveXtreamSource } from './xtream-refresh';
import type { XtreamResult } from '../xtream/client';
import type { XtreamCategory, XtreamSource } from '../xtream/types';
import { loadStoredCategories, loadStoredItems, loadStoredWarmMeta, saveStoredCategories, saveStoredItems, saveStoredWarmMeta } from './catalog-storage';
import type { CatalogMemory } from './catalog-memory';
import { recomputeSearch } from './search.actions';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, set } from './typed';

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

/**
 * The whole background-warm flow, parameterized. `vod-warm.ts` and
 * `series-warm.ts` were structurally identical — same guards, same TTL
 * checks, same rehydrate-before-fetch path, same sanity cap, same
 * finally-block — differing only in which key constants, memory instance,
 * endpoints and item mapper they used. Keeping two copies meant every fix
 * had to be made twice, with nothing to catch it when only one was.
 *
 * The returned pair mirrors what each module exported before: the warm
 * itself, and a test-only reset for its in-flight guard.
 */
export interface CatalogWarmerConfig<TItem, TDetail, TRaw> {
    /** Storage-key prefix and memory identity — `'vod'` or `'series'`. */
    prefix: string;
    memory: CatalogMemory<TItem, TDetail>;
    /** Spektrum keys this warmer owns. */
    keys: { warmStatus: string; activeCategoryId: string; count: string };
    fetchCategories: (source: XtreamSource) => Promise<XtreamResult<XtreamCategory[]>>;
    /** Called with no category id — the documented "returns the ENTIRE catalog" quirk. */
    fetchAll: (source: XtreamSource) => Promise<XtreamResult<TRaw[]>>;
    toItem: (raw: TRaw) => TItem;
    categoryIdOf: (item: TItem) => string;
}

export interface CatalogWarmer {
    warm: () => Promise<void>;
    resetForTests: () => void;
}

export function createCatalogWarmer<TItem, TDetail, TRaw>(
    config: CatalogWarmerConfig<TItem, TDetail, TRaw>,
): CatalogWarmer {
    const { prefix, memory, keys } = config;
    let warmInFlight = false;

    /**
     * Recomputes the active category's count (a warm may have found a more
     * complete item list than a prior lazy fetch had) and re-runs an
     * in-progress search so `search.loadedOnly` drops immediately —
     * `recomputeSearch()` is a no-op when there is no active query.
     */
    function afterWarm(): void {
        const activeCategoryId = get<string | null>(keys.activeCategoryId);
        if (activeCategoryId) {
            const items = memory.itemsFor(activeCategoryId);
            if (items) set(keys.count, items.length);
        }
        recomputeSearch();
    }

    async function warm(): Promise<void> {
        if (warmInFlight) return;
        if (getPlatform().storage.tier !== 'full') {
            set(keys.warmStatus, 'skipped');
            return;
        }

        const now = Date.now();
        if (isFresh(memory.warmedAt(), now, CATALOG_TTL_MS)) {
            set(keys.warmStatus, 'warmed');
            return;
        }

        warmInFlight = true;
        set(keys.warmStatus, 'warming');
        try {
            const storedMeta = await loadStoredWarmMeta(prefix);
            if (storedMeta && isFresh(storedMeta.fetchedAt, now, CATALOG_TTL_MS)) {
                // A previous session's warm is still fresh — reload it from
                // the full-tier storage cache rather than re-fetching.
                await rehydrateWarmedCatalog(prefix, memory, storedMeta.fetchedAt);
                set(keys.warmStatus, 'warmed');
                afterWarm();
                return;
            }

            const account = await resolveActiveXtreamSource();
            if (!account) {
                set(keys.warmStatus, 'skipped');
                return;
            }

            const categoriesResult = await config.fetchCategories(account.source);
            if (!categoriesResult.ok) {
                set(keys.warmStatus, 'skipped');
                return;
            }

            const allResult = await config.fetchAll(account.source);
            if (!allResult.ok) {
                set(keys.warmStatus, 'skipped');
                return;
            }

            // Sanity cap (WARM_ROW_CAP's own header): a dump this large is
            // discarded outright — keep whatever categories were already
            // loaded lazily, publish nothing, stay lazy.
            if (allResult.data.length > WARM_ROW_CAP) {
                set(keys.warmStatus, 'skipped');
                return;
            }

            const items = allResult.data.map(config.toItem);
            const byCategory = groupWarmedItems(
                items,
                categoriesResult.data.map((c: XtreamCategory) => c.id),
                config.categoryIdOf,
            );
            commitWarmedCatalog(prefix, memory, categoriesResult.data, byCategory, now);

            set(keys.warmStatus, 'warmed');
            afterWarm();
        } finally {
            warmInFlight = false;
        }
    }

    return {
        warm,
        resetForTests: () => {
            warmInFlight = false;
        },
    };
}
