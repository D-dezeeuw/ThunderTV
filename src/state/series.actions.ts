import { defineFn } from 'spektrum';
import { getSeries, getSeriesCategories, getSeriesInfo } from '../xtream/client';
import type { XtreamSeries, XtreamSeriesInfo } from '../xtream/types';
import { seriesEpisodeUrl } from '../xtream/urls';
import { createCatalogActions, parseCatalogId, type CatalogActions } from './catalog-actions';
import { refocusCategoryRow } from './groups.actions';
import { selectChannel } from './list.actions';
import { loadStoredDetail, saveStoredDetail } from './catalog-storage';
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
    type SeriesItem,
} from './series';
import {
    cachedSeriesSource,
    makeSeriesEpisodeId,
    makeSeriesRowId,
    seriesCategoryName,
    seriesCategoryRail,
    seriesItemToRow,
    seriesMemory,
    setCachedSeriesSource,
    toSeriesDetail,
    toSeriesItem,
} from './series-rows';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { replace, set } from './typed';
import { resolveActiveXtreamSource, type ResolvedXtreamAccount } from './xtream-refresh';

/**
 * TV Shows (series) catalog actions (Phase 21).
 *
 * Browsing is `catalog-actions.ts`'s parameterized core (UPGRADES U10),
 * shared with Movies. What stays here is what genuinely differs: a series
 * is a container rather than something directly playable, and its detail is
 * a seasons/episodes tree with its own status key, its own error reason,
 * and a fetch shared with episode playback.
 *
 * Built on first use, never at module scope — same import-cycle reasoning
 * as `vod.actions.ts`'s.
 */
let catalog: CatalogActions | null = null;

function seriesCatalog(): CatalogActions {
    catalog ??= createCatalogActions<SeriesItem, XtreamSeries>({
        kind: 'series',
        keys: {
            status: SERIES_STATUS,
            errorReason: SERIES_ERROR_REASON,
            stale: SERIES_STALE,
            categories: SERIES_CATEGORIES,
            activeCategoryId: SERIES_ACTIVE_CATEGORY_ID,
            count: SERIES_COUNT,
        },
        categoriesCap: SERIES_CATEGORIES_CAP,
        rail: seriesCategoryRail,
        memory: seriesMemory,
        setCachedSource: setCachedSeriesSource,
        cachedSource: cachedSeriesSource,
        fetchCategories: (source) => getSeriesCategories(source),
        fetchItems: (source, categoryId) => getSeries(source, categoryId),
        toItem: toSeriesItem,
        categoryName: seriesCategoryName,
        // A series row's URL is built per episode, not per item, so the
        // source the shared core threads through is unused here.
        toRow: (item, _source, categoryName) => seriesItemToRow(item, categoryName),
    });
    return catalog;
}

export function openSeriesCatalog(): Promise<void> {
    return seriesCatalog().open();
}

export function selectSeriesCategory(categoryId: string): Promise<void> {
    return seriesCatalog().selectCategory(categoryId);
}

export function republishSeriesRows(): boolean {
    return seriesCatalog().republishRows();
}

function publishSeriesCategories(): void {
    seriesCatalog().publishCategories();
}

export function registerSeriesActions(): void {
    defineFn('series/open', () => {
        void openSeriesCatalog();
    });
    defineFn('series/selectCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (id) void selectSeriesCategory(id);
    });
    defineFn('series/toggleCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (!id || !seriesCategoryRail.toggle(id)) return;
        publishSeriesCategories();
        // Same focus-survival reasoning as `vod/toggleCategory`.
        refocusCategoryRow(id);
    });
    defineFn('series/openDetail', (el) => {
        const id = parseCatalogId(el.dataset['seriesId']);
        if (id !== null) void openSeriesDetail(id);
    });
    defineFn('series/closeDetail', () => {
        closeSeriesDetail();
    });
    defineFn('series/playEpisode', (el) => {
        const seriesId = parseCatalogId(el.dataset['seriesId']);
        const episodeId = el.dataset['episodeId'];
        if (seriesId !== null && episodeId) void playSeriesEpisode(seriesId, episodeId);
    });
}

/** Same "why not just re-read the key" reasoning as `vod.actions.ts`'s token — see `sequence-token.ts`. */
const detailOpen = createSequenceToken();

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
