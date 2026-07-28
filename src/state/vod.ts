import { setValue } from 'spektrum';
import type { XtreamVodStream } from '../xtream/types';
import type { WarmStatus } from './catalog-warm';

/**
 * The Movies (VOD) catalog's Spektrum surface (Phase 21). Categories and
 * the currently-open item's detail are the only things published here —
 * the category's item list itself reaches the DOM through the existing
 * virtual-list pipeline (`vod.actions.ts`'s `publishVodRows()`,
 * `state/list-rows.ts`'s `setDisplayedRows()`), never as a second Spektrum
 * array (`state/README.md`'s bulk-data bypass rule).
 */
export const VOD_CATEGORIES = 'vod.categories';
export const VOD_ACTIVE_CATEGORY_ID = 'vod.activeCategoryId';
export const VOD_STATUS = 'vod.status';
export const VOD_ERROR_REASON = 'vod.errorReason';
export const VOD_COUNT = 'vod.count';
export const VOD_DETAIL_ID = 'vod.detailId';
export const VOD_DETAIL = 'vod.detail';
/** Background full-catalog warm status (`vod-warm.ts`) — `'idle'` until a warm is ever attempted; `'skipped'` covers every reason a warm didn't (fully) run: a non-`'full'` storage tier, no active Xtream account, a failed fetch, or the `WARM_ROW_CAP` sanity cap — a UI surfacing this later can treat all of those as "still browsing lazily", the distinction between them isn't worth a second flag. */
export const VOD_WARM_STATUS = 'vod.warmStatus';

/** A provider's VOD category list is a few hundred entries at most — well under the 1000 global bulk-data ceiling, but capped explicitly (`registry-catalog.ts`'s `maxItems`) so a pathological provider can't flood the picker. */
export const VOD_CATEGORIES_CAP = 500;

export type VodStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Enum-ish, UI-copy-free (`state/README.md`'s rule) — the UI stage maps each to its own message. `'no-source'`: no active, fully-credentialed Xtream account. `'fetch-failed'`: the account exists but `get_vod_categories`/`get_vod_streams` failed. */
export type VodErrorReason = 'no-source' | 'fetch-failed' | null;

/** `XtreamVodStream` plus a pre-normalized search key, computed once when the item enters the catalog (`vod-rows.ts`'s `toVodItem()`) — never recomputed per keystroke (`src/search/README.md`'s contract). */
export interface VodItem extends XtreamVodStream {
    searchKey: string;
}

/** The compact row `vod.categories` actually publishes — id/name only, never the full `XtreamCategory` (nothing else is needed for a picker). */
export interface VodCategoryRow {
    id: string;
    name: string;
}

/** Denormalized snapshot for the one currently-open movie — `VodItem` fields plus whatever `get_vod_info` added, once fetched. */
export interface VodDetail {
    streamId: number;
    name: string;
    categoryId: string;
    categoryName: string | null;
    logo: string | null;
    rating: string | null;
    year: string | null;
    containerExtension: string;
    plot: string | null;
    genre: string | null;
    durationSecs: number | null;
    releaseDate: string | null;
}

export interface VodState {
    categories: VodCategoryRow[];
    activeCategoryId: string | null;
    status: VodStatus;
    errorReason: VodErrorReason;
    count: number;
    detailId: number | null;
    detail: VodDetail | null;
    warmStatus: WarmStatus;
}

export const VOD_DEFAULTS: VodState = {
    categories: [],
    activeCategoryId: null,
    status: 'idle',
    errorReason: null,
    count: 0,
    detailId: null,
    detail: null,
    warmStatus: 'idle',
};

export function initVodState(): void {
    setValue(VOD_CATEGORIES, VOD_DEFAULTS.categories);
    setValue(VOD_ACTIVE_CATEGORY_ID, VOD_DEFAULTS.activeCategoryId);
    setValue(VOD_STATUS, VOD_DEFAULTS.status);
    setValue(VOD_ERROR_REASON, VOD_DEFAULTS.errorReason);
    setValue(VOD_COUNT, VOD_DEFAULTS.count);
    setValue(VOD_DETAIL_ID, VOD_DEFAULTS.detailId);
    setValue(VOD_DETAIL, VOD_DEFAULTS.detail);
    setValue(VOD_WARM_STATUS, VOD_DEFAULTS.warmStatus);
}
