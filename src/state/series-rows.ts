import type { ChannelRow } from '../m3u/types';
import { normalizeForSearch } from '../search/normalize';
import type { XtreamSeries, XtreamSeriesInfo, XtreamSource } from '../xtream/types';
import { createCatalogMemory } from './catalog-memory';
import { get } from './typed';
import {
    SERIES_CATEGORIES,
    SERIES_DETAIL_EPISODES_CAP,
    type SeriesCategoryRow,
    type SeriesDetail,
    type SeriesDetailSeason,
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
        name: item.name,
        url: '',
        group: categoryName,
        logo: item.cover ?? null,
        tvgId: null,
        radio: false,
    };
}

export function toSeriesDetail(item: SeriesItem, categoryName: string | null, info?: XtreamSeriesInfo): SeriesDetail {
    const seasons: SeriesDetailSeason[] = [];
    let episodeBudget = SERIES_DETAIL_EPISODES_CAP;
    for (const season of info ?? []) {
        if (episodeBudget <= 0) break;
        const episodes = season.episodes.slice(0, episodeBudget).map((ep) => ({
            episodeId: ep.episodeId,
            episode: ep.episode,
            title: ep.title,
            containerExtension: ep.containerExtension,
            durationSecs: ep.durationSecs ?? null,
        }));
        episodeBudget -= episodes.length;
        seasons.push({ season: season.season, episodes });
    }

    return {
        seriesId: item.seriesId,
        name: item.name,
        categoryId: item.categoryId,
        categoryName,
        cover: item.cover ?? null,
        plot: item.plot ?? null,
        year: item.year ?? null,
        rating: item.rating ?? null,
        seasons,
    };
}

/** Test-only / source-switch reset. */
export function resetSeriesMemoryForTests(): void {
    seriesMemory.reset();
    cachedSource = null;
}
