import { getPlatform } from '../core/platform';
import { getVodCategories, getVodStreams } from '../xtream/client';
import { commitWarmedCatalog, groupWarmedItems, rehydrateWarmedCatalog, WARM_ROW_CAP } from './catalog-warm';
import { loadStoredWarmMeta } from './catalog-storage';
import { recomputeSearch } from './search.actions';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, set } from './typed';
import { toVodItem, vodMemory } from './vod-rows';
import { VOD_ACTIVE_CATEGORY_ID, VOD_COUNT, VOD_WARM_STATUS } from './vod';
import { resolveActiveXtreamSource } from './xtream-refresh';

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
 * repeatedly and from multiple call sites: `warmInFlight` guards a
 * concurrent double-warm, and the TTL/tier checks make every redundant call
 * a cheap no-op.
 */
let warmInFlight = false;

export async function warmVodCatalog(): Promise<void> {
    if (warmInFlight) return;
    if (getPlatform().storage.tier !== 'full') {
        set(VOD_WARM_STATUS, 'skipped');
        return;
    }

    const now = Date.now();
    if (isFresh(vodMemory.warmedAt(), now, CATALOG_TTL_MS)) {
        set(VOD_WARM_STATUS, 'warmed');
        return;
    }

    warmInFlight = true;
    set(VOD_WARM_STATUS, 'warming');
    try {
        const storedMeta = await loadStoredWarmMeta('vod');
        if (storedMeta && isFresh(storedMeta.fetchedAt, now, CATALOG_TTL_MS)) {
            // A previous session's warm is still fresh — reload it from the
            // full-tier storage cache rather than re-fetching over the network.
            await rehydrateWarmedCatalog('vod', vodMemory, storedMeta.fetchedAt);
            set(VOD_WARM_STATUS, 'warmed');
            afterWarm();
            return;
        }

        const account = await resolveActiveXtreamSource();
        if (!account) {
            set(VOD_WARM_STATUS, 'skipped');
            return;
        }

        const categoriesResult = await getVodCategories(account.source);
        if (!categoriesResult.ok) {
            set(VOD_WARM_STATUS, 'skipped');
            return;
        }

        const streamsResult = await getVodStreams(account.source); // no category id = the whole catalog
        if (!streamsResult.ok) {
            set(VOD_WARM_STATUS, 'skipped');
            return;
        }

        // Sanity cap (documented decision, catalog-warm.ts's WARM_ROW_CAP
        // header): a dump this large is discarded outright — keep whatever
        // categories were already loaded lazily, publish nothing, stay lazy.
        if (streamsResult.data.length > WARM_ROW_CAP) {
            set(VOD_WARM_STATUS, 'skipped');
            return;
        }

        const items = streamsResult.data.map(toVodItem);
        const byCategory = groupWarmedItems(items, categoriesResult.data.map((c) => c.id), (item) => item.categoryId);
        commitWarmedCatalog('vod', vodMemory, categoriesResult.data, byCategory, now);

        set(VOD_WARM_STATUS, 'warmed');
        afterWarm();
    } finally {
        warmInFlight = false;
    }
}

/**
 * Recomputes the active category's count (warm may have found a more
 * complete item list than a prior lazy fetch had) and re-runs an
 * already-in-progress search so `search.loadedOnly` drops immediately —
 * `recomputeSearch()` is a no-op when there's no active query.
 */
function afterWarm(): void {
    const activeCategoryId = get<string | null>(VOD_ACTIVE_CATEGORY_ID);
    if (activeCategoryId) {
        const items = vodMemory.itemsFor(activeCategoryId);
        if (items) set(VOD_COUNT, items.length);
    }
    recomputeSearch();
}

/** Test-only. @internal */
export function resetVodWarmForTests(): void {
    warmInFlight = false;
}
