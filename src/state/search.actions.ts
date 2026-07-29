import { defineFn } from 'spektrum';
import type { ChannelRow } from '../m3u/types';
import { DEFAULT_SEARCH_LIMIT, rankSearch } from '../search/fuzzy';
import { normalizeForSearch } from '../search/normalize';
import { liveDisplayRows } from './live-rows';
import { setDisplayedRows } from './list-rows';
import {
    allLoadedSeriesItems,
    seriesCategoryName,
    seriesHasUnfetchedCategories,
    seriesItemToRow,
} from './series-rows';
import {
    isSearchScope,
    SEARCH_ACTIVE,
    SEARCH_LOADED_ONLY,
    SEARCH_QUERY,
    SEARCH_RESULT_COUNTS,
    SEARCH_SCOPE,
    type SearchResultCounts,
    type SearchScope,
} from './search';
import { replace, set } from './typed';
import { allLoadedVodItems, cachedVodSource, vodCategoryName, vodHasUnfetchedCategories, vodItemToRow } from './vod-rows';

/**
 * Scoped fuzzy search actions. `recomputeSearch()` runs synchronously on
 * every query/scope change (Phase 09's own debounce was never built — the
 * phase mandate's explicit fallback: `rankSearch()` is ~19ms/20k rows, fine
 * without one) and is the function the UI stage should re-trigger if it
 * ever needs to force a refresh (e.g. after the Movies/Series catalog
 * finishes an in-flight fetch) — exported for exactly that.
 *
 * `currentQuery`/`currentScope` are kept as plain module variables, not
 * re-read from Spektrum state inside `recomputeSearch()` — `state/typed.ts`'s
 * `set()` only queues a write; nothing is visible to `get()` until the next
 * `tick()` drains it, and `setSearchQuery()`/`setSearchScope()` call
 * `recomputeSearch()` synchronously, in the same tick, right after their own
 * `set()`. Re-reading here would see the *previous* value, not the one just
 * set (the exact hazard `sequence-token.ts` documents for the VOD/series
 * "superseded" checks) — a real bug, not just a test artifact, since a
 * fast/synchronous response (or simply no other code ticking in between)
 * reproduces it every time, not only under test.
 */
let currentQuery = '';
let currentScope: SearchScope = 'all';
export function registerSearchActions(): void {
    defineFn('search/setQuery', (el) => {
        if (el instanceof HTMLInputElement) setSearchQuery(el.value);
    });
    defineFn('search/setScope', (el) => {
        const scope = el.dataset['scope'];
        if (isSearchScope(scope)) setSearchScope(scope);
    });
    defineFn('search/clear', () => {
        clearSearch();
    });
}

/**
 * Channels have no persisted `searchKey` field (`ChannelRow` is owned by
 * `src/m3u/`, out of this phase's `src/state/`-only scope) — so this module
 * builds its own small cache the first time a search touches a given row
 * array, keyed by reference identity: `liveDisplayRows()` only returns a
 * *new* array when the underlying catalog is actually rebuilt (source
 * switch, a Live filter change), never on a keystroke, so this still
 * satisfies `src/search/README.md`'s "normalize once, score many times"
 * contract in practice.
 */
let channelIndexSource: readonly ChannelRow[] | null = null;
let channelSearchKeys = new Map<string, string>();

function channelSearchKey(row: ChannelRow): string {
    const rows = liveDisplayRows();
    if (channelIndexSource !== rows) {
        channelSearchKeys = new Map(rows.map((r) => [r.id, normalizeForSearch(r.name)]));
        channelIndexSource = rows;
    }
    return channelSearchKeys.get(row.id) ?? '';
}

export function setSearchQuery(raw: string): void {
    currentQuery = raw;
    set(SEARCH_QUERY, raw);
    set(SEARCH_ACTIVE, raw.trim() !== '');
    recomputeSearch();
}

export function setSearchScope(scope: SearchScope): void {
    currentScope = scope;
    set(SEARCH_SCOPE, scope);
    recomputeSearch();
}

export function clearSearch(): void {
    currentQuery = '';
    set(SEARCH_QUERY, '');
    set(SEARCH_ACTIVE, false);
    publishResults([], { channels: 0, movies: 0, series: 0 }, false);
}

/**
 * Recomputes and publishes the current query/scope's results. Rows publish
 * channels first, then movies, then series (`state/README.md`'s row-
 * publication table), each individually capped at `DEFAULT_SEARCH_LIMIT`
 * before concatenation so no single scope can crowd out the others, then
 * the concatenation itself is capped at `DEFAULT_SEARCH_LIMIT` again for
 * the `'all'` scope. `resultCounts` reports each scope's own (uncapped-by-
 * the-concat) match count, so "12 channels, 3 movies" stays accurate even
 * when the combined list had to truncate.
 */
export function recomputeSearch(): void {
    const query = currentQuery;
    const scope = currentScope;

    if (query.trim() === '') {
        publishResults([], { channels: 0, movies: 0, series: 0 }, false);
        return;
    }

    const wantChannels = scope === 'channels' || scope === 'all';
    const wantMovies = scope === 'movies' || scope === 'all';
    const wantSeries = scope === 'series' || scope === 'all';

    const channelMatches = wantChannels ? rankSearch(query, liveDisplayRows(), channelSearchKey, DEFAULT_SEARCH_LIMIT) : [];
    const vodMatches = wantMovies
        ? rankSearch(query, allLoadedVodItems(), (item) => item.searchKey, DEFAULT_SEARCH_LIMIT)
        : [];
    const seriesMatches = wantSeries
        ? rankSearch(query, allLoadedSeriesItems(), (item) => item.searchKey, DEFAULT_SEARCH_LIMIT)
        : [];

    const counts: SearchResultCounts = {
        channels: channelMatches.length,
        movies: vodMatches.length,
        series: seriesMatches.length,
    };
    const loadedOnly = (wantMovies && vodHasUnfetchedCategories()) || (wantSeries && seriesHasUnfetchedCategories());

    const vodSource = cachedVodSource();
    const rows: ChannelRow[] = [
        ...channelMatches,
        ...vodMatches.map((item) => vodItemToRow(item, vodSource, vodCategoryName(item.categoryId))),
        ...seriesMatches.map((item) => seriesItemToRow(item, seriesCategoryName(item.categoryId))),
    ].slice(0, DEFAULT_SEARCH_LIMIT);

    publishResults(rows, counts, loadedOnly);
}

function publishResults(rows: ChannelRow[], counts: SearchResultCounts, loadedOnly: boolean): void {
    replace(SEARCH_RESULT_COUNTS, counts);
    set(SEARCH_LOADED_ONLY, loadedOnly);
    setDisplayedRows(rows);
}

/** Test-only: resets the module-level query/scope/channel-index memory this file keeps outside Spektrum state. Never call from app code. */
export function resetSearchActionsForTests(): void {
    currentQuery = '';
    currentScope = 'all';
    channelIndexSource = null;
    channelSearchKeys = new Map();
}
