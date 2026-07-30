import { defineFn } from 'spektrum';
import { getSeries, getSeriesCategories, getSeriesInfo } from '../xtream/client';
import type { XtreamSeriesInfo } from '../xtream/types';
import { seriesEpisodeUrl } from '../xtream/urls';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { setDisplayedRows } from './list-rows';
import { selectChannel } from './list.actions';
import { sortCategoriesCountryFirst } from './catalog-sort';
import { loadStoredCategories, loadStoredDetail, loadStoredItems, saveStoredCategories, saveStoredDetail, saveStoredItems } from './catalog-storage';
import { setActiveChannel } from './player.actions';
import { createSequenceToken } from './sequence-token';
import {
    SERIES_ACTIVE_CATEGORY_ID,
    SERIES_CATEGORIES,
    SERIES_CATEGORIES_CAP,
    SERIES_COUNT,
    SERIES_DETAIL,
    SERIES_DETAIL_ERROR_REASON,
    SERIES_DETAIL_ID,
    SERIES_DETAIL_STATUS,
    SERIES_ERROR_REASON,
    SERIES_STALE,
    SERIES_STATUS,
    type SeriesCategoryRow,
    type SeriesItem,
} from './series';
import {
    makeSeriesEpisodeId,
    makeSeriesRowId,
    seriesCategoryName,
    seriesItemToRow,
    seriesMemory,
    setCachedSeriesSource,
    toSeriesDetail,
    toSeriesItem,
} from './series-rows';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, replace, set } from './typed';
import { resolveActiveXtreamSource, type ResolvedXtreamAccount } from './xtream-refresh';

/**
 * TV Shows (series) catalog actions (Phase 21) — the exact same shape as
 * `vod.actions.ts`, with one addition (`playSeriesEpisode`) since a series
 * itself is a container, never directly playable — see `series-rows.ts`'s
 * `seriesItemToRow()` doc.
 */
export function registerSeriesActions(): void {
    defineFn('series/open', () => {
        void openSeriesCatalog();
    });
    defineFn('series/selectCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (id) void selectSeriesCategory(id);
    });
    defineFn('series/openDetail', (el) => {
        const id = parseSeriesId(el.dataset['seriesId']);
        if (id !== null) void openSeriesDetail(id);
    });
    defineFn('series/closeDetail', () => {
        closeSeriesDetail();
    });
    defineFn('series/playEpisode', (el) => {
        const seriesId = parseSeriesId(el.dataset['seriesId']);
        const episodeId = el.dataset['episodeId'];
        if (seriesId !== null && episodeId) void playSeriesEpisode(seriesId, episodeId);
    });
}

function parseSeriesId(raw: string | undefined): number | null {
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
}

let openInFlight = false;
/** Same "why not just re-read the key" reasoning as `vod.actions.ts`'s tokens — see `sequence-token.ts`. */
const categorySelection = createSequenceToken();
const detailOpen = createSequenceToken();

/** Same flow/decision as `vod.actions.ts`'s `openVodCatalog()` — no "All" pseudo-category, auto-select is the first (now country-first-sorted) category. */
export async function openSeriesCatalog(): Promise<void> {
    if (openInFlight) return;
    openInFlight = true;
    set(SERIES_STATUS, 'loading');
    set(SERIES_ERROR_REASON, null);
    try {
        const account = await resolveActiveXtreamSource();
        if (!account) {
            set(SERIES_STATUS, 'error');
            set(SERIES_ERROR_REASON, 'no-source');
            return;
        }
        setCachedSeriesSource(account.source);

        const now = Date.now();
        let categories = seriesMemory.categories();
        let fetchedAt = seriesMemory.categoriesFetchedAt();

        if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const stored = await loadStoredCategories('series');
            // Adopted past its TTL — see `vod.actions.ts`'s identical branch
            // for why: it is what turns "no connection" into "yesterday's
            // catalog" instead of an error screen.
            if (stored && (categories.length === 0 || stored.fetchedAt > (fetchedAt ?? 0))) {
                seriesMemory.setCategories(stored.categories);
                seriesMemory.setCategoriesFetchedAt(stored.fetchedAt);
                categories = stored.categories;
                fetchedAt = stored.fetchedAt;
            }
        }

        if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const result = await getSeriesCategories(account.source);
            if (result.ok) {
                categories = result.data;
                fetchedAt = now;
                seriesMemory.setCategories(categories);
                seriesMemory.setCategoriesFetchedAt(fetchedAt);
                void saveStoredCategories('series', { fetchedAt, categories });
                set(SERIES_STALE, false);
            } else if (categories.length > 0) {
                set(SERIES_STALE, true);
            } else {
                set(SERIES_STATUS, 'error');
                set(SERIES_ERROR_REASON, 'fetch-failed');
                return;
            }
        } else {
            set(SERIES_STALE, false);
        }

        const sorted = sortCategoriesCountryFirst(categories, get<string>(SETTINGS_LIVE_COUNTRY) ?? '');
        const rows: SeriesCategoryRow[] = sorted
            .slice(0, SERIES_CATEGORIES_CAP)
            .map((c) => ({ id: c.id, name: cleanCatalogDisplayName(c.name) }));
        set(SERIES_CATEGORIES, rows);

        const first = rows[0];
        if (first) {
            await selectSeriesCategory(first.id);
        } else {
            set(SERIES_STATUS, 'ready');
        }
    } finally {
        openInFlight = false;
    }
}

export async function selectSeriesCategory(categoryId: string): Promise<void> {
    const token = categorySelection.begin();
    set(SERIES_ACTIVE_CATEGORY_ID, categoryId);
    set(SERIES_STATUS, 'loading');

    const account = await resolveActiveXtreamSource();
    if (!account) {
        set(SERIES_STATUS, 'error');
        set(SERIES_ERROR_REASON, 'no-source');
        return;
    }
    setCachedSeriesSource(account.source);

    const now = Date.now();
    let items = seriesMemory.itemsFor(categoryId);
    let fetchedAt = seriesMemory.itemsFetchedAt(categoryId);

    if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
        const stored = await loadStoredItems<SeriesItem>('series', categoryId);
        if (stored && (!items || stored.fetchedAt > (fetchedAt ?? 0))) {
            seriesMemory.setItemsFor(categoryId, stored.items, stored.fetchedAt);
            items = stored.items;
            fetchedAt = stored.fetchedAt;
        }
    }

    if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
        const result = await getSeries(account.source, categoryId);
        if (result.ok) {
            items = result.data.map(toSeriesItem);
            fetchedAt = now;
            seriesMemory.setItemsFor(categoryId, items, fetchedAt);
            void saveStoredItems('series', categoryId, { items, fetchedAt });
            set(SERIES_STALE, false);
        } else if (!items) {
            set(SERIES_STATUS, 'error');
            set(SERIES_ERROR_REASON, 'fetch-failed');
            return;
        } else {
            set(SERIES_STALE, true);
        }
    }

    // Same defensive/unreachable guard as `vod.actions.ts`'s
    // `selectVodCategory()` — see its comment.
    if (!items) {
        set(SERIES_STATUS, 'error');
        set(SERIES_ERROR_REASON, 'fetch-failed');
        return;
    }

    if (!categorySelection.isCurrent(token)) return; // a newer selectCategory call started meanwhile

    set(SERIES_ERROR_REASON, null);
    set(SERIES_COUNT, items.length);
    set(SERIES_STATUS, 'ready');
    const categoryName = seriesCategoryName(categoryId);
    setDisplayedRows(items.map((item) => seriesItemToRow(item, categoryName)));
}

/** Series' half of the shared-list republish — see `vod.actions.ts`'s `republishVodRows()` for why this is separate from `openSeriesCatalog()`. */
export function republishSeriesRows(): boolean {
    const categoryId = get<string | null>(SERIES_ACTIVE_CATEGORY_ID);
    if (!categoryId) return false;
    const items = seriesMemory.itemsFor(categoryId);
    if (!items) return false;
    const categoryName = seriesCategoryName(categoryId);
    setDisplayedRows(items.map((item) => seriesItemToRow(item, categoryName)));
    set(SERIES_COUNT, items.length);
    set(SERIES_STATUS, 'ready');
    return true;
}

/**
 * Same partial-then-filled publish + `replace()` reasoning as
 * `vod.actions.ts`'s `openVodDetail()`, plus `series.detailStatus`/
 * `series.detailErrorReason` (`series.ts`'s doc) — every early return below
 * leaves the panel visibly `'error'`/`'no-source'` or `'fetch-failed'`,
 * never silently stuck on `'loading'`. A failure with a stale cached `info`
 * to fall back on still reports `'ready'` (stale beats alarming).
 */
export async function openSeriesDetail(seriesId: number): Promise<void> {
    const item = seriesMemory.findItem(seriesId);
    if (!item) return;

    const token = detailOpen.begin();
    set(SERIES_DETAIL_ID, seriesId);
    set(SERIES_DETAIL_STATUS, 'loading');
    set(SERIES_DETAIL_ERROR_REASON, null);
    const categoryName = seriesCategoryName(item.categoryId);
    replace(SERIES_DETAIL, toSeriesDetail(item, categoryName));

    const account = await resolveActiveXtreamSource();
    if (!account) {
        if (!detailOpen.isCurrent(token)) return;
        set(SERIES_DETAIL_STATUS, 'error');
        set(SERIES_DETAIL_ERROR_REASON, 'no-source');
        return;
    }
    setCachedSeriesSource(account.source);

    const { info, failed } = await fetchSeriesInfo(seriesId, account);
    if (!detailOpen.isCurrent(token)) return; // superseded — the user moved on

    if (failed && !info) {
        set(SERIES_DETAIL_STATUS, 'error');
        set(SERIES_DETAIL_ERROR_REASON, 'fetch-failed');
        return;
    }

    set(SERIES_DETAIL_STATUS, 'ready');
    if (info) replace(SERIES_DETAIL, toSeriesDetail(item, categoryName, info));
}

export function closeSeriesDetail(): void {
    set(SERIES_DETAIL_ID, null);
    set(SERIES_DETAIL_STATUS, 'idle');
    set(SERIES_DETAIL_ERROR_REASON, null);
    replace(SERIES_DETAIL, null);
}

/** One `fetchSeriesInfo()` outcome — `failed` is true only when the network call itself failed; a cache hit (fresh or the stale-but-still-returned fallback) is never a failure, even though `info` can legitimately be `undefined` in both cases. */
interface SeriesInfoFetch {
    info: XtreamSeriesInfo | undefined;
    failed: boolean;
}

/** Module-memory cache first, then the full-tier storage cache, then the network — shared by `openSeriesDetail()` and `playSeriesEpisode()` (an episode needs the season/episode list too, to find its `containerExtension`). `account` is always already-resolved non-null (both call sites resolve it themselves first). */
async function fetchSeriesInfo(seriesId: number, account: ResolvedXtreamAccount): Promise<SeriesInfoFetch> {
    const now = Date.now();

    let info = seriesMemory.detail(seriesId);
    if (!info || !isFresh(seriesMemory.detailFetchedAt(seriesId), now, CATALOG_TTL_MS)) {
        const stored = await loadStoredDetail<XtreamSeriesInfo>('series', seriesId);
        // No freshness gate — a season/episode list is exactly what an
        // offline viewer needs to still see, and a show that gained an
        // episode yesterday is a much smaller problem than a panel that
        // shows none at all.
        if (stored) {
            seriesMemory.setDetail(seriesId, stored.data, stored.fetchedAt);
            info = stored.data;
        }
    }
    if (!isFresh(seriesMemory.detailFetchedAt(seriesId), now, CATALOG_TTL_MS)) {
        const result = await getSeriesInfo(account.source, seriesId);
        // `failed` only when there is nothing to fall back on: with a stale
        // cache in hand the panel reports ready (stale beats alarming, which
        // is this function's existing contract for a failed refresh).
        if (!result.ok) return { info, failed: info === undefined };
        info = result.data;
        seriesMemory.setDetail(seriesId, info, now);
        void saveStoredDetail('series', seriesId, { fetchedAt: now, data: info });
    }
    return { info, failed: false };
}

/**
 * Finds the episode inside the (TTL-cached) `get_series_info` payload,
 * builds its stream URL, and hands off through `setActiveChannel()` — same
 * "reuse the existing player action path" decision as `vod.actions.ts`'s
 * `playVod()`. The played row's name is the episode title alone (falling
 * back to the series name if the provider sent no title) — deliberately
 * not a synthesized "S1E2" label, which would be UI-copy-shaped formatting
 * this state-layer module has no business inventing.
 */
export async function playSeriesEpisode(seriesId: number, episodeId: number | string): Promise<void> {
    const item = seriesMemory.findItem(seriesId);
    if (!item) return;
    const account = await resolveActiveXtreamSource();
    if (!account) return;
    setCachedSeriesSource(account.source);

    const { info } = await fetchSeriesInfo(seriesId, account);
    const episode = (info ?? []).flatMap((season) => season.episodes).find((ep) => String(ep.episodeId) === String(episodeId));
    if (!episode) return;

    const url = seriesEpisodeUrl(account.source, episode.episodeId, episode.containerExtension);
    setActiveChannel({
        id: makeSeriesEpisodeId(seriesId, episode.episodeId),
        sourceId: account.sourceId,
        name: episode.title || item.name,
        streamUrl: url,
        logo: item.cover ?? null,
        group: seriesCategoryName(item.categoryId),
        kind: 'series',
    });
    selectChannel(makeSeriesRowId(seriesId));
    // Same reason as `playVod()`: the detail panel covers the list body,
    // player pane included.
    closeSeriesDetail();
}
