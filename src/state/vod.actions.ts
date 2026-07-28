import { defineFn } from 'spektrum';
import { setDisplayedRows } from './list-rows';
import { sortCategoriesCountryFirst } from './catalog-sort';
import { loadStoredCategories, loadStoredDetail, loadStoredItems, saveStoredCategories, saveStoredDetail, saveStoredItems } from './catalog-storage';
import { setActiveChannel } from './player.actions';
import { createSequenceToken } from './sequence-token';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, replace, set } from './typed';
import {
    toVodDetail,
    toVodItem,
    vodCategoryName,
    vodItemToRow,
    vodMemory,
    setCachedVodSource,
} from './vod-rows';
import { getVodCategories, getVodInfo, getVodStreams } from '../xtream/client';
import type { XtreamVodInfo } from '../xtream/types';
import { resolveActiveXtreamSource } from './xtream-refresh';
import {
    VOD_ACTIVE_CATEGORY_ID,
    VOD_CATEGORIES,
    VOD_CATEGORIES_CAP,
    VOD_COUNT,
    VOD_DETAIL,
    VOD_DETAIL_ID,
    VOD_ERROR_REASON,
    VOD_STATUS,
    type VodCategoryRow,
    type VodItem,
} from './vod';

/**
 * Movies (VOD) catalog actions (Phase 21): open the catalog, browse a
 * category, open/close one movie's detail, and play it. Mirrors the shape
 * `settings.actions.ts`'s Xtream account save and `live.actions.ts` already
 * establish — an in-flight guard per async flow, a "superseded mid-flight"
 * check before the final publish (`list-load.ts`'s pattern), and every
 * mutation going through `state/typed.ts`'s `set()`/`replace()`.
 */
export function registerVodActions(): void {
    defineFn('vod/open', () => {
        void openVodCatalog();
    });
    defineFn('vod/selectCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (id) void selectVodCategory(id);
    });
    defineFn('vod/openDetail', (el) => {
        const id = parseStreamId(el.dataset['streamId']);
        if (id !== null) void openVodDetail(id);
    });
    defineFn('vod/closeDetail', () => {
        closeVodDetail();
    });
    defineFn('vod/play', (el) => {
        const id = parseStreamId(el.dataset['streamId']);
        if (id !== null) void playVod(id);
    });
}

function parseStreamId(raw: string | undefined): number | null {
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
}

let openInFlight = false;
/**
 * Guards `selectVodCategory()`/`openVodDetail()`'s "did a newer call
 * supersede me" check (`sequence-token.ts`'s doc explains why re-reading
 * the Spektrum key each flow itself just wrote is not reliable here).
 */
const categorySelection = createSequenceToken();
const detailOpen = createSequenceToken();

/**
 * Resolves the active Xtream source, fetches (or reuses a fresh cache of)
 * `get_vod_categories`, sorts them country-first, and auto-selects the
 * first one — which is the first *country-matching* category whenever one
 * exists, since the sort already put it there (`catalog-sort.ts`'s doc).
 * **Decision:** no "All" pseudo-category — auto-select is simply "the first
 * category after sorting," falling back to whatever is first when no
 * country match exists. An "All" entry would need one very large,
 * unfiltered `get_vod_streams` call on every open; a real category is
 * already the cheaper, always-relevant first stop.
 */
export async function openVodCatalog(): Promise<void> {
    if (openInFlight) return;
    openInFlight = true;
    set(VOD_STATUS, 'loading');
    set(VOD_ERROR_REASON, null);
    try {
        const account = await resolveActiveXtreamSource();
        if (!account) {
            set(VOD_STATUS, 'error');
            set(VOD_ERROR_REASON, 'no-source');
            return;
        }
        setCachedVodSource(account.source);

        const now = Date.now();
        let categories = vodMemory.categories();
        let fetchedAt = vodMemory.categoriesFetchedAt();

        if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const stored = await loadStoredCategories('vod');
            if (stored && isFresh(stored.fetchedAt, now, CATALOG_TTL_MS)) {
                vodMemory.setCategories(stored.categories);
                vodMemory.setCategoriesFetchedAt(stored.fetchedAt);
                categories = stored.categories;
                fetchedAt = stored.fetchedAt;
            }
        }

        if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const result = await getVodCategories(account.source);
            if (!result.ok) {
                set(VOD_STATUS, 'error');
                set(VOD_ERROR_REASON, 'fetch-failed');
                return;
            }
            categories = result.data;
            fetchedAt = now;
            vodMemory.setCategories(categories);
            vodMemory.setCategoriesFetchedAt(fetchedAt);
            void saveStoredCategories('vod', { fetchedAt, categories });
        }

        const sorted = sortCategoriesCountryFirst(categories, get<string>(SETTINGS_LIVE_COUNTRY) ?? '');
        const rows: VodCategoryRow[] = sorted.slice(0, VOD_CATEGORIES_CAP).map((c) => ({ id: c.id, name: c.name }));
        set(VOD_CATEGORIES, rows);

        const first = rows[0];
        if (first) {
            await selectVodCategory(first.id);
        } else {
            set(VOD_STATUS, 'ready');
        }
    } finally {
        openInFlight = false;
    }
}

/** Lazily fetches (or reuses a fresh cache of) one category's items, then publishes them as rows through the shared virtual-list pipeline — see `README.md`'s row-publication table. */
export async function selectVodCategory(categoryId: string): Promise<void> {
    const token = categorySelection.begin();
    set(VOD_ACTIVE_CATEGORY_ID, categoryId);
    set(VOD_STATUS, 'loading');

    const account = await resolveActiveXtreamSource();
    if (!account) {
        set(VOD_STATUS, 'error');
        set(VOD_ERROR_REASON, 'no-source');
        return;
    }
    setCachedVodSource(account.source);

    const now = Date.now();
    let items = vodMemory.itemsFor(categoryId);
    let fetchedAt = vodMemory.itemsFetchedAt(categoryId);

    if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
        const stored = await loadStoredItems<VodItem>('vod', categoryId);
        if (stored && isFresh(stored.fetchedAt, now, CATALOG_TTL_MS)) {
            vodMemory.setItemsFor(categoryId, stored.items, stored.fetchedAt);
            items = stored.items;
            fetchedAt = stored.fetchedAt;
        }
    }

    if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
        const result = await getVodStreams(account.source, categoryId);
        if (!result.ok) {
            set(VOD_STATUS, 'error');
            set(VOD_ERROR_REASON, 'fetch-failed');
            return;
        }
        items = result.data.map(toVodItem);
        fetchedAt = now;
        vodMemory.setItemsFor(categoryId, items, fetchedAt);
        void saveStoredItems('vod', categoryId, { items, fetchedAt });
    }

    // Unreachable in practice (the fetch branch above always either returns
    // on failure or assigns a real array) — kept as an explicit guard so
    // `items` below is provably defined rather than relying on TS to prove
    // it across the two conditional reassignments.
    if (!items) {
        set(VOD_STATUS, 'error');
        set(VOD_ERROR_REASON, 'fetch-failed');
        return;
    }

    // A rapid second selectCategory call could race this one — bail without
    // publishing stale rows if a newer call started meanwhile.
    if (!categorySelection.isCurrent(token)) return;

    set(VOD_ERROR_REASON, null);
    set(VOD_COUNT, items.length);
    set(VOD_STATUS, 'ready');
    const categoryName = vodCategoryName(categoryId);
    setDisplayedRows(items.map((item) => vodItemToRow(item, account.source, categoryName)));
}

/** Publishes an immediate, partial snapshot from memory, then fills in `get_vod_info`'s fields once fetched (TTL-cached, module memory first, then the full-tier storage cache, then the network) — `replace()`, not `set()`, since two different movies' optional fields (`plot`/`genre`/`rating`/…) would otherwise bleed into each other via Spektrum's object merge (`state/README.md`'s merge-hazard finding). */
export async function openVodDetail(streamId: number): Promise<void> {
    const item = vodMemory.findItem(streamId);
    if (!item) return;

    const token = detailOpen.begin();
    set(VOD_DETAIL_ID, streamId);
    const categoryName = vodCategoryName(item.categoryId);
    replace(VOD_DETAIL, toVodDetail(item, categoryName));

    const account = await resolveActiveXtreamSource();
    if (!account) return;
    setCachedVodSource(account.source);

    const now = Date.now();
    let info = vodMemory.detail(streamId);
    if (!info || !isFresh(vodMemory.detailFetchedAt(streamId), now, CATALOG_TTL_MS)) {
        const stored = await loadStoredDetail<XtreamVodInfo>('vod', streamId);
        if (stored && isFresh(stored.fetchedAt, now, CATALOG_TTL_MS)) {
            vodMemory.setDetail(streamId, stored.data, stored.fetchedAt);
            info = stored.data;
        }
    }
    if (!info || !isFresh(vodMemory.detailFetchedAt(streamId), now, CATALOG_TTL_MS)) {
        const result = await getVodInfo(account.source, streamId);
        if (!result.ok) return;
        info = result.data;
        vodMemory.setDetail(streamId, info, now);
        void saveStoredDetail('vod', streamId, { fetchedAt: now, data: info });
    }

    if (!detailOpen.isCurrent(token)) return; // superseded — the user moved on
    replace(VOD_DETAIL, toVodDetail(item, categoryName, info));
}

export function closeVodDetail(): void {
    set(VOD_DETAIL_ID, null);
    replace(VOD_DETAIL, null);
}

/**
 * Finds `streamId` in memory, builds its stream URL, and hands off through
 * the existing player action path (`player.actions.ts`'s `setActiveChannel()`)
 * — reused as-is rather than a parallel action, per the phase mandate.
 * **Decision:** `records.ts`'s `ActiveChannelSnapshot` gained one additive,
 * optional `kind` field (`'live' | 'vod' | 'series'`) so a future player/UI
 * change can tell a movie/episode apart from a live channel; every existing
 * caller omits it (unaffected — `undefined` reads as "live", matching every
 * snapshot ever built before this phase).
 */
export async function playVod(streamId: number): Promise<void> {
    const item = vodMemory.findItem(streamId);
    if (!item) return;
    const account = await resolveActiveXtreamSource();
    if (!account) return;
    setCachedVodSource(account.source);

    const categoryName = vodCategoryName(item.categoryId);
    const row = vodItemToRow(item, account.source, categoryName);
    setActiveChannel({
        id: row.id,
        sourceId: account.sourceId,
        name: item.name,
        streamUrl: row.url,
        logo: item.icon ?? null,
        group: categoryName,
        kind: 'vod',
    });
}
