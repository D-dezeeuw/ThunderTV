import type { ChannelRow } from '../m3u/types';
import { normalizeForSearch } from '../search/normalize';
import type { XtreamSource, XtreamVodInfo, XtreamVodStream } from '../xtream/types';
import { vodStreamUrl } from '../xtream/urls';
import { createCatalogMemory } from './catalog-memory';
import { get } from './typed';
import { VOD_CATEGORIES, type VodCategoryRow, type VodDetail, type VodItem } from './vod';

/**
 * The Movies catalog's module memory (never Spektrum state — see `vod.ts`'s
 * header) plus the small bits of row/detail mapping shared by
 * `vod.actions.ts` and `search.actions.ts` (which needs to turn a matched
 * `VodItem` back into a displayable row without duplicating this logic).
 * Split out from `vod.actions.ts` the same way `live-rows.ts` is split from
 * `live.actions.ts` — memory and pure mapping in one file, the async
 * fetch/select/detail flow in the other.
 */
export const vodMemory = createCatalogMemory<VodItem, XtreamVodInfo>((item) => item.streamId);

/**
 * The `XtreamSource` last successfully resolved by `vod.actions.ts` (open/
 * selectCategory/openDetail all resolve it before touching the network) —
 * cached so `search.actions.ts` can build a playable row URL synchronously,
 * without a second async `resolveActiveXtreamSource()` round-trip on every
 * keystroke. By the time any `VodItem` exists in `vodMemory` to search over,
 * this has always already been set by the same call that populated it.
 */
let cachedSource: XtreamSource | null = null;

export function setCachedVodSource(source: XtreamSource): void {
    cachedSource = source;
}

export function cachedVodSource(): XtreamSource | null {
    return cachedSource;
}

export function allLoadedVodItems(): readonly VodItem[] {
    return vodMemory.allItems();
}

export function vodHasUnfetchedCategories(): boolean {
    return vodMemory.hasUnfetchedCategories();
}

/** Looks up a category's display name out of the already-published compact list — the one source of truth for what a category is called, shared by row/detail building and search result rows alike. */
export function vodCategoryName(categoryId: string): string | null {
    return get<VodCategoryRow[]>(VOD_CATEGORIES)?.find((c) => c.id === categoryId)?.name ?? null;
}

export function toVodItem(stream: XtreamVodStream): VodItem {
    return { ...stream, searchKey: normalizeForSearch(stream.name) };
}

export function makeVodRowId(streamId: number): string {
    return `vod:${String(streamId)}`;
}

/**
 * `item`'s playable stream URL is baked directly into `url` (via
 * `vodStreamUrl()`) so this row works identically whether a future click
 * handler reuses the generic `list/selectChannel` path or `vod/play`'s own
 * typed action — see `README.md`'s row-publication section for the full
 * decision. `source` is only ever `null` defensively (see `cachedVodSource()`'s
 * doc) — a movie can't be in memory to map without one having been resolved.
 */
export function vodItemToRow(item: VodItem, source: XtreamSource | null, categoryName: string | null): ChannelRow {
    return {
        id: makeVodRowId(item.streamId),
        name: item.name,
        url: source ? vodStreamUrl(source, item.streamId, item.containerExtension) : '',
        group: categoryName,
        logo: item.icon ?? null,
        tvgId: null,
        radio: false,
    };
}

export function toVodDetail(item: VodItem, categoryName: string | null, info?: XtreamVodInfo): VodDetail {
    return {
        streamId: item.streamId,
        name: item.name,
        categoryId: item.categoryId,
        categoryName,
        logo: item.icon ?? null,
        rating: item.rating ?? null,
        year: item.year ?? null,
        containerExtension: item.containerExtension,
        plot: info?.plot ?? null,
        genre: info?.genre ?? null,
        durationSecs: info?.durationSecs ?? null,
        releaseDate: info?.releaseDate ?? null,
    };
}

/** Test-only / source-switch reset. */
export function resetVodMemoryForTests(): void {
    vodMemory.reset();
    cachedSource = null;
}
