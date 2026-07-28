import { setValue } from 'spektrum';
import type { XtreamSeries } from '../xtream/types';
import type { WarmStatus } from './catalog-warm';

/**
 * The TV Shows (series) catalog's Spektrum surface (Phase 21) — same shape
 * as `vod.ts`, plus a bounded seasons/episodes structure for the one
 * currently-open series (`get_series_info`, TTL-cached). A category's
 * series list itself reaches the DOM through the shared virtual-list
 * pipeline, never a second Spektrum array — see `vod.ts`'s header for the
 * full reasoning, identical here.
 */
export const SERIES_CATEGORIES = 'series.categories';
export const SERIES_ACTIVE_CATEGORY_ID = 'series.activeCategoryId';
export const SERIES_STATUS = 'series.status';
export const SERIES_ERROR_REASON = 'series.errorReason';
export const SERIES_COUNT = 'series.count';
export const SERIES_DETAIL_ID = 'series.detailId';
export const SERIES_DETAIL = 'series.detail';
/** Same role/contract as `vod.ts`'s `VOD_WARM_STATUS` — see its doc. */
export const SERIES_WARM_STATUS = 'series.warmStatus';

/** Same reasoning as `VOD_CATEGORIES_CAP` — a few hundred provider categories at most, capped defensively. */
export const SERIES_CATEGORIES_CAP = 500;
/** One series rarely has more than a few dozen episodes across every season; this ceiling only guards against a pathological provider (`series.detail.seasons[].episodes[]`, flattened count). */
export const SERIES_DETAIL_EPISODES_CAP = 500;

export type SeriesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Same enum-ish, UI-copy-free contract as `VodErrorReason`. */
export type SeriesErrorReason = 'no-source' | 'fetch-failed' | null;

/** `XtreamSeries` plus a pre-normalized search key, computed once at catalog-load time (`series-rows.ts`'s `toSeriesItem()`). */
export interface SeriesItem extends XtreamSeries {
    searchKey: string;
}

export interface SeriesCategoryRow {
    id: string;
    name: string;
}

export interface SeriesDetailEpisode {
    episodeId: number | string;
    episode: number;
    title: string;
    containerExtension: string;
    durationSecs: number | null;
}

export interface SeriesDetailSeason {
    season: number;
    episodes: SeriesDetailEpisode[];
}

/** Denormalized snapshot for the one currently-open series — bounded to `SERIES_DETAIL_EPISODES_CAP` total episodes across every season. */
export interface SeriesDetail {
    seriesId: number;
    name: string;
    categoryId: string;
    categoryName: string | null;
    cover: string | null;
    plot: string | null;
    year: string | null;
    rating: string | null;
    seasons: SeriesDetailSeason[];
}

export interface SeriesState {
    categories: SeriesCategoryRow[];
    activeCategoryId: string | null;
    status: SeriesStatus;
    errorReason: SeriesErrorReason;
    count: number;
    detailId: number | null;
    detail: SeriesDetail | null;
    warmStatus: WarmStatus;
}

export const SERIES_DEFAULTS: SeriesState = {
    categories: [],
    activeCategoryId: null,
    status: 'idle',
    errorReason: null,
    count: 0,
    detailId: null,
    detail: null,
    warmStatus: 'idle',
};

export function initSeriesState(): void {
    setValue(SERIES_CATEGORIES, SERIES_DEFAULTS.categories);
    setValue(SERIES_ACTIVE_CATEGORY_ID, SERIES_DEFAULTS.activeCategoryId);
    setValue(SERIES_STATUS, SERIES_DEFAULTS.status);
    setValue(SERIES_ERROR_REASON, SERIES_DEFAULTS.errorReason);
    setValue(SERIES_COUNT, SERIES_DEFAULTS.count);
    setValue(SERIES_DETAIL_ID, SERIES_DEFAULTS.detailId);
    setValue(SERIES_DETAIL, SERIES_DEFAULTS.detail);
    setValue(SERIES_WARM_STATUS, SERIES_DEFAULTS.warmStatus);
}
