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
/**
 * The currently-open series' OWN fetch status/error, distinct from
 * `series.status`/`series.errorReason` (the *category* list's status).
 * `openSeriesDetail()` previously left both silently unset on a failed
 * `get_series_info` call — the panel just kept showing its immediate
 * partial snapshot (poster/title, zero episodes), indistinguishable from a
 * series that genuinely has no episodes listed. These two keys make that
 * distinction visible: `'error'` + a reason drives the panel's classified
 * error message and Retry affordance; `'ready'` with an empty
 * `series.detail.rows` is the honest "no episodes" case, unchanged.
 * `series.status` is deliberately NOT reused here — it also gates whether
 * `list-shell__body` (and therefore the detail overlay itself) renders at
 * all, so writing 'error' into it while a detail fetch fails would hide the
 * whole panel instead of showing an error inside it.
 */
export const SERIES_DETAIL_STATUS = 'series.detailStatus';
/** Same enum-ish, UI-copy-free contract as `SERIES_ERROR_REASON`, scoped to the open series' own fetch. */
export const SERIES_DETAIL_ERROR_REASON = 'series.detailErrorReason';
/** Same role/contract as `vod.ts`'s `VOD_WARM_STATUS` — see its doc. */
export const SERIES_WARM_STATUS = 'series.warmStatus';

/** Same reasoning as `VOD_CATEGORIES_CAP` — a few hundred provider categories at most, capped defensively. */
export const SERIES_CATEGORIES_CAP = 500;
/** One series rarely has more than a few dozen episodes across every season; this ceiling only guards against a pathological provider (`series.detail.rows`'s episode-kind rows, flattened count — see `series-rows.ts`'s `buildSeriesDetailRows()`). */
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

/**
 * One flattened row of `series.detail.rows` — either a season header or one
 * episode, in the exact order the panel should render them. A discriminated
 * union rather than a nested `seasons[].episodes[]` structure so the panel
 * markup can bind it with a single-level `data-each` — see `series-rows.ts`'s
 * `buildSeriesDetailRows()` for the full "why" and `index.html`'s
 * series-detail panel comment for the nested-`data-each` bug this replaces.
 * `durationMins` is rounded when this row is built (`series-rows.ts`), never
 * in the template — no `Math.*` in a `{{ }}` expression.
 */
export type SeriesDetailRow =
    | { kind: 'season'; season: number }
    | {
          kind: 'episode';
          episodeId: number | string;
          /** The season this episode belongs to. Carried on the row itself — a flat row list has no parent to ask, and the download filename ("Show - S01E03 - Title") needs it. */
          season: number;
          episode: number;
          title: string;
          durationMins: number | null;
          /**
           * The file extension the provider serves this episode under. Here
           * rather than only in `XtreamSeriesInfo` because the download
           * action needs the filename *synchronously*, inside the click: the
           * web save picker requires transient user activation, so it cannot
           * wait on a `get_series_info` round trip
           * (`src/core/platform/download-adapter.ts`).
           */
          containerExtension: string;
      };

/** Denormalized snapshot for the one currently-open series — `rows` bounded to `SERIES_DETAIL_EPISODES_CAP` total episode rows. */
export interface SeriesDetail {
    seriesId: number;
    name: string;
    categoryId: string;
    categoryName: string | null;
    cover: string | null;
    plot: string | null;
    year: string | null;
    rating: string | null;
    rows: SeriesDetailRow[];
}

export interface SeriesState {
    categories: SeriesCategoryRow[];
    activeCategoryId: string | null;
    status: SeriesStatus;
    errorReason: SeriesErrorReason;
    count: number;
    detailId: number | null;
    detail: SeriesDetail | null;
    detailStatus: SeriesStatus;
    detailErrorReason: SeriesErrorReason;
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
    detailStatus: 'idle',
    detailErrorReason: null,
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
    setValue(SERIES_DETAIL_STATUS, SERIES_DEFAULTS.detailStatus);
    setValue(SERIES_DETAIL_ERROR_REASON, SERIES_DEFAULTS.detailErrorReason);
    setValue(SERIES_WARM_STATUS, SERIES_DEFAULTS.warmStatus);
}
