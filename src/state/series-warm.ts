import { getSeries, getSeriesCategories } from '../xtream/client';
import { createCatalogWarmer } from './catalog-warm';
import { toSeriesItem, seriesMemory } from './series-rows';
import { SERIES_ACTIVE_CATEGORY_ID, SERIES_COUNT, SERIES_WARM_STATUS } from './series';

/**
 * Background full-catalog warm for series — same shape and reasoning as
 * `vod-warm.ts`'s `warmVodCatalog()`, using `get_series` with no category id
 * (the same "no category id = the whole catalog" quirk). See that file's
 * header for the full rationale; not repeated here. Both share
 * `catalog-warm.ts`'s `createCatalogWarmer()`, so the flow exists once.
 */
const warmer = createCatalogWarmer({
    prefix: 'series',
    memory: seriesMemory,
    keys: {
        warmStatus: SERIES_WARM_STATUS,
        activeCategoryId: SERIES_ACTIVE_CATEGORY_ID,
        count: SERIES_COUNT,
    },
    fetchCategories: getSeriesCategories,
    fetchAll: getSeries,
    toItem: toSeriesItem,
    categoryIdOf: (item) => item.categoryId,
});

export async function warmSeriesCatalog(): Promise<void> {
    await warmer.warm();
}

/** Test-only. @internal */
export function resetSeriesWarmForTests(): void {
    warmer.resetForTests();
}
