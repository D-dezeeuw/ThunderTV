import { getPlatform } from '../core/platform';
import { getSeries, getSeriesCategories } from '../xtream/client';
import { commitWarmedCatalog, groupWarmedItems, rehydrateWarmedCatalog, WARM_ROW_CAP } from './catalog-warm';
import { loadStoredWarmMeta } from './catalog-storage';
import { recomputeSearch } from './search.actions';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, set } from './typed';
import { toSeriesItem, seriesMemory } from './series-rows';
import { SERIES_ACTIVE_CATEGORY_ID, SERIES_COUNT, SERIES_WARM_STATUS } from './series';
import { resolveActiveXtreamSource } from './xtream-refresh';

/**
 * Background full-catalog warm for series — same shape and reasoning as
 * `vod-warm.ts`'s `warmVodCatalog()`, using `get_series` with no category id
 * (the same "no category id = the whole catalog" quirk). See that file's
 * header for the full rationale; not repeated here.
 */
let warmInFlight = false;

export async function warmSeriesCatalog(): Promise<void> {
    if (warmInFlight) return;
    if (getPlatform().storage.tier !== 'full') {
        set(SERIES_WARM_STATUS, 'skipped');
        return;
    }

    const now = Date.now();
    if (isFresh(seriesMemory.warmedAt(), now, CATALOG_TTL_MS)) {
        set(SERIES_WARM_STATUS, 'warmed');
        return;
    }

    warmInFlight = true;
    set(SERIES_WARM_STATUS, 'warming');
    try {
        const storedMeta = await loadStoredWarmMeta('series');
        if (storedMeta && isFresh(storedMeta.fetchedAt, now, CATALOG_TTL_MS)) {
            await rehydrateWarmedCatalog('series', seriesMemory, storedMeta.fetchedAt);
            set(SERIES_WARM_STATUS, 'warmed');
            afterWarm();
            return;
        }

        const account = await resolveActiveXtreamSource();
        if (!account) {
            set(SERIES_WARM_STATUS, 'skipped');
            return;
        }

        const categoriesResult = await getSeriesCategories(account.source);
        if (!categoriesResult.ok) {
            set(SERIES_WARM_STATUS, 'skipped');
            return;
        }

        const seriesResult = await getSeries(account.source); // no category id = the whole catalog
        if (!seriesResult.ok) {
            set(SERIES_WARM_STATUS, 'skipped');
            return;
        }

        if (seriesResult.data.length > WARM_ROW_CAP) {
            set(SERIES_WARM_STATUS, 'skipped');
            return;
        }

        const items = seriesResult.data.map(toSeriesItem);
        const byCategory = groupWarmedItems(items, categoriesResult.data.map((c) => c.id), (item) => item.categoryId);
        commitWarmedCatalog('series', seriesMemory, categoriesResult.data, byCategory, now);

        set(SERIES_WARM_STATUS, 'warmed');
        afterWarm();
    } finally {
        warmInFlight = false;
    }
}

function afterWarm(): void {
    const activeCategoryId = get<string | null>(SERIES_ACTIVE_CATEGORY_ID);
    if (activeCategoryId) {
        const items = seriesMemory.itemsFor(activeCategoryId);
        if (items) set(SERIES_COUNT, items.length);
    }
    recomputeSearch();
}

/** Test-only. @internal */
export function resetSeriesWarmForTests(): void {
    warmInFlight = false;
}
