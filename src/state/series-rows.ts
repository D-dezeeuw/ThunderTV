import type { ChannelRow } from '../m3u/types';
import { normalizeForSearch } from '../search/normalize';
import type { XtreamSeries, XtreamSeriesInfo, XtreamSource } from '../xtream/types';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { createCatalogMemory } from './catalog-memory';
import { get } from './typed';
import {
    SERIES_CATEGORIES,
    SERIES_DETAIL_EPISODES_CAP,
    type SeriesCategoryRow,
    type SeriesDetail,
    type SeriesDetailRow,
    type SeriesItem,
} from './series';

/** Memory + row/detail mapping for the series catalog — see `vod-rows.ts`'s header for why this is split from `series.actions.ts`. */
export const seriesMemory = createCatalogMemory<SeriesItem, XtreamSeriesInfo>((item) => item.seriesId);

/** Same role as `vod-rows.ts`'s `cachedVodSource()` — see its doc. */
let cachedSource: XtreamSource | null = null;

export function setCachedSeriesSource(source: XtreamSource): void {
    cachedSource = source;
}

export function cachedSeriesSource(): XtreamSource | null {
    return cachedSource;
}

export function allLoadedSeriesItems(): readonly SeriesItem[] {
    return seriesMemory.allItems();
}

export function seriesHasUnfetchedCategories(): boolean {
    return seriesMemory.hasUnfetchedCategories();
}

export function seriesCategoryName(categoryId: string): string | null {
    return get<SeriesCategoryRow[]>(SERIES_CATEGORIES)?.find((c) => c.id === categoryId)?.name ?? null;
}

export function toSeriesItem(series: XtreamSeries): SeriesItem {
    return { ...series, searchKey: normalizeForSearch(series.name) };
}

export function makeSeriesRowId(seriesId: number): string {
    return `series:${String(seriesId)}`;
}

export function makeSeriesEpisodeId(seriesId: number, episodeId: number | string): string {
    return `series-ep:${String(seriesId)}:${String(episodeId)}`;
}

/**
 * A series is a container, not a single stream — clicking one opens detail,
 * it never plays directly, so `url` is deliberately `''`. See `README.md`'s
 * row-publication section: a future click handler must trigger
 * `series/openDetail`, not reuse the generic play-on-click list path, for
 * rows built by this function (the same distinction `vod-rows.ts`'s
 * `vodItemToRow()` does NOT need, since a movie *is* directly playable).
 */
export function seriesItemToRow(item: SeriesItem, categoryName: string | null): ChannelRow {
    return {
        id: makeSeriesRowId(item.seriesId),
        name: cleanCatalogDisplayName(item.name),
        url: '',
        group: categoryName,
        logo: item.cover ?? null,
        tvgId: null,
        radio: false,
    };
}

/**
 * Flattens `get_series_info`'s seasons/episodes into ONE ordered row array —
 * season headers and episodes interleaved in display order — for a
 * single-level `data-each` in the series-detail panel. Spektrum's `data-each`
 * clones an element's *first element child* into its container; a two-level
 * nested `data-each` (season container → episode container) needs the outer
 * container to be a dedicated parent with the season block as its only
 * child, which the original markup got wrong (`data-each` sat directly on
 * the season block itself, so its own nested episode-list sibling was never
 * part of the cloned template and never got bound at all — see index.html's
 * series-detail panel comment for the full diagnosis). Flattening sidesteps
 * that class of bug entirely, matching every other list in the app
 * (`list.visibleRows`, `list.groups`, …), and lets `durationMins` be rounded
 * HERE rather than via `Math.round()` inside a `{{ }}` template expression.
 *
 * Bounded by `cap` total EPISODE rows — season header rows are free (a
 * provider rarely has more than a handful of seasons). Once the cap is
 * reached mid-season, no further seasons are started either, matching the
 * pre-flatten `toSeriesDetail()`'s own per-season truncation.
 */
export function buildSeriesDetailRows(info: XtreamSeriesInfo, cap: number): SeriesDetailRow[] {
    const rows: SeriesDetailRow[] = [];
    let episodeBudget = cap;
    for (const season of info) {
        if (episodeBudget <= 0) break;
        rows.push({ kind: 'season', season: season.season });
        const episodes = season.episodes.slice(0, episodeBudget);
        episodeBudget -= episodes.length;
        for (const ep of episodes) {
            rows.push({
                kind: 'episode',
                episodeId: ep.episodeId,
                // `season.season`, not `ep.season`: the season block is the
                // authority on which season these episodes are under, and a
                // provider that omits it per-episode still groups correctly.
                season: season.season,
                episode: ep.episode,
                title: ep.title,
                durationMins: ep.durationSecs != null ? Math.round(ep.durationSecs / 60) : null,
                containerExtension: ep.containerExtension,
            });
        }
    }
    return rows;
}

export function toSeriesDetail(item: SeriesItem, categoryName: string | null, info?: XtreamSeriesInfo): SeriesDetail {
    return {
        seriesId: item.seriesId,
        name: cleanCatalogDisplayName(item.name),
        categoryId: item.categoryId,
        categoryName,
        cover: item.cover ?? null,
        plot: item.plot ?? null,
        year: item.year ?? null,
        rating: item.rating ?? null,
        rows: info ? buildSeriesDetailRows(info, SERIES_DETAIL_EPISODES_CAP) : [],
    };
}

/** Test-only / source-switch reset. */
export function resetSeriesMemoryForTests(): void {
    seriesMemory.reset();
    cachedSource = null;
}
