import { defineFn } from 'spektrum';
import { createCatalogActions, parseCatalogId, type CatalogActions } from './catalog-actions';
import { refocusCategoryRow } from './groups.actions';
import { loadStoredDetail, saveStoredDetail } from './catalog-storage';
import { setActiveChannel } from './player.actions';
import { createSequenceToken } from './sequence-token';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { replace, set } from './typed';
import {
    cachedVodSource,
    toVodDetail,
    toVodItem,
    vodCategoryName,
    vodCategoryRail,
    vodItemToRow,
    vodMemory,
    setCachedVodSource,
} from './vod-rows';
import { getVodCategories, getVodInfo, getVodStreams } from '../xtream/client';
import type { XtreamVodInfo, XtreamVodStream } from '../xtream/types';
import { resolveActiveXtreamSource } from './xtream-refresh';
import {
    VOD_ACTIVE_CATEGORY_ID,
    VOD_CATEGORIES,
    VOD_CATEGORIES_CAP,
    VOD_COUNT,
    VOD_DETAIL,
    VOD_DETAIL_ID,
    VOD_ERROR_REASON,
    VOD_STALE,
    VOD_STATUS,
    type VodItem,
} from './vod';

/**
 * Movies (VOD) catalog actions (Phase 21).
 *
 * Browsing — open, category select, republish — is
 * `catalog-actions.ts`'s parameterized core (UPGRADES U10), shared
 * byte-for-byte with Series. What stays here is the part that genuinely
 * differs: a movie's detail is one flat `get_vod_info` snapshot, and a
 * movie is directly playable where a series is a container.
 *
 * The catalog instance is built on first use, never at module scope:
 * `list.actions.ts` imports this module, and the config below reads
 * `vod-rows.ts`'s own module-level rail and memory singletons, so calling
 * the factory during evaluation puts the whole `src/state/` import cycle on
 * the critical path and whichever module is mid-initialization loses.
 * Deferring to the first action means every dependency is evaluated by then.
 */
let catalog: CatalogActions | null = null;

function vodCatalog(): CatalogActions {
    catalog ??= createCatalogActions<VodItem, XtreamVodStream>({
        kind: 'vod',
        keys: {
            status: VOD_STATUS,
            errorReason: VOD_ERROR_REASON,
            stale: VOD_STALE,
            categories: VOD_CATEGORIES,
            activeCategoryId: VOD_ACTIVE_CATEGORY_ID,
            count: VOD_COUNT,
        },
        categoriesCap: VOD_CATEGORIES_CAP,
        rail: vodCategoryRail,
        memory: vodMemory,
        setCachedSource: setCachedVodSource,
        cachedSource: cachedVodSource,
        fetchCategories: (source) => getVodCategories(source),
        fetchItems: (source, categoryId) => getVodStreams(source, categoryId),
        toItem: toVodItem,
        categoryName: vodCategoryName,
        toRow: (item, source, categoryName) => vodItemToRow(item, source, categoryName),
    });
    return catalog;
}

export function openVodCatalog(): Promise<void> {
    return vodCatalog().open();
}

export function selectVodCategory(categoryId: string): Promise<void> {
    return vodCatalog().selectCategory(categoryId);
}

export function republishVodRows(): boolean {
    return vodCatalog().republishRows();
}

function publishVodCategories(): void {
    vodCatalog().publishCategories();
}

export function registerVodActions(): void {
    defineFn('vod/open', () => {
        void openVodCatalog();
    });
    defineFn('vod/selectCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (id) void selectVodCategory(id);
    });
    defineFn('vod/toggleCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (!id || !vodCategoryRail.toggle(id)) return;
        publishVodCategories();
        // The republish above discards the very button this was pressed on
        // (Spektrum re-clones `data-each` rows), taking the focus ring with
        // it — see `refocusCategoryRow()`. Covers the pointer and Enter/OK
        // paths alike, since both arrive here as a click.
        refocusCategoryRow(id);
    });
    defineFn('vod/openDetail', (el) => {
        const id = parseCatalogId(el.dataset['streamId']);
        if (id !== null) void openVodDetail(id);
    });
    defineFn('vod/closeDetail', () => {
        closeVodDetail();
    });
    defineFn('vod/play', (el) => {
        const id = parseCatalogId(el.dataset['streamId']);
        if (id !== null) void playVod(id);
    });
}

/**
 * Guards `openVodDetail()`'s "did a newer call supersede me" check
 * (`sequence-token.ts`'s doc explains why re-reading the Spektrum key each
 * flow itself just wrote is not reliable here).
 */
const detailOpen = createSequenceToken();

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
        // No freshness gate: a plot, a genre and a running time do not go out
        // of date the way a category listing does, and offline this is the
        // only version of them there is.
        if (stored) {
            vodMemory.setDetail(streamId, stored.data, stored.fetchedAt);
            info = stored.data;
        }
    }
    if (!isFresh(vodMemory.detailFetchedAt(streamId), now, CATALOG_TTL_MS)) {
        const result = await getVodInfo(account.source, streamId);
        // A failure here is not fatal: whatever `info` already holds — the
        // stale cache, or nothing but the row snapshot already published —
        // is still the best answer available.
        if (result.ok) {
            info = result.data;
            vodMemory.setDetail(streamId, info, now);
            void saveStoredDetail('vod', streamId, { fetchedAt: now, data: info });
        }
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
    // The detail panel is absolutely positioned over the whole list body
    // (catalog.css's `.catalog-detail`), which is also where the player
    // pane appears — leaving it open would hide the picture the viewer just
    // asked for behind the poster they asked for it from.
    closeVodDetail();
}
