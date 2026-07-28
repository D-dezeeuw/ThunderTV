import { getVodCategories, getVodStreams } from '../xtream/client';
import { createCatalogWarmer } from './catalog-warm';
import { toVodItem, vodMemory } from './vod-rows';
import { VOD_ACTIVE_CATEGORY_ID, VOD_COUNT, VOD_WARM_STATUS } from './vod';

/**
 * Background full-catalog warm. `get_vod_streams` called with **no**
 * `category_id` returns the ENTIRE VOD catalog in one request — the same
 * quirk `client.ts` already documents for `getLiveStreams()` (Feature
 * 19.2.7) and that `getVodStreams()`/`vod.actions.ts` themselves rely on
 * per-category. Warming once means `search.ts`'s `movies`/`all` scopes can
 * honestly cover *every* category for 24h from cache, not only whichever
 * ones the user happened to open via `vod/selectCategory`.
 *
 * Exported for the app layer to call after first paint / on a Movies tab
 * open — this module never wires its own timer or interval. Safe to call
 * repeatedly and from multiple call sites: the warmer guards a concurrent
 * double-warm, and the TTL/tier checks make every redundant call a cheap
 * no-op. The flow itself lives in `catalog-warm.ts`'s
 * `createCatalogWarmer()`, shared with `series-warm.ts`.
 */
const warmer = createCatalogWarmer({
    prefix: 'vod',
    memory: vodMemory,
    keys: {
        warmStatus: VOD_WARM_STATUS,
        activeCategoryId: VOD_ACTIVE_CATEGORY_ID,
        count: VOD_COUNT,
    },
    fetchCategories: getVodCategories,
    fetchAll: getVodStreams,
    toItem: toVodItem,
    categoryIdOf: (item) => item.categoryId,
});

export async function warmVodCatalog(): Promise<void> {
    await warmer.warm();
}

/** Test-only. @internal */
export function resetVodWarmForTests(): void {
    warmer.resetForTests();
}
