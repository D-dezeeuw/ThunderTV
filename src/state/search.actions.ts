import { defineFn } from 'spektrum';
import type { Route } from '../app/router';
import type { ChannelRow } from '../m3u/types';
import { DEFAULT_SEARCH_LIMIT, rankSearch } from '../search/fuzzy';
import { normalizeForSearch } from '../search/normalize';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { ensureRadioRows, liveDisplayRows, radioDisplayRows } from './live-rows';
import { setDisplayedRows } from './list-rows';
import type { SeriesItem } from './series';
import {
    allLoadedSeriesItems,
    seriesCategoryName,
    seriesHasUnfetchedCategories,
    seriesItemToRow,
} from './series-rows';
import {
    sweptMultiSource,
    sweptSeriesItems,
    sweptSeriesOwnership,
    sweptVodItems,
    sweptVodOwnership,
} from './catalog-sweep';
import {
    SEARCH_ACTIVE,
    SEARCH_ALL_SOURCES,
    SEARCH_LOADED_ONLY,
    SEARCH_QUERY,
    SEARCH_RESULT_COUNTS,
    SEARCH_SCOPE,
    type SearchResultCounts,
    type SearchScope,
} from './search';
import { get, replace, set } from './typed';
import { UI_ACTIVE_VIEW } from './ui';
import type { VodItem } from './vod';
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
/** Same plain-module-variable reasoning as the two above — the sweep runner flips these and re-ranks in the same tick, so neither can be re-read from state here. */
let currentAllSources = false;
let currentSweepPartial = false;
export function registerSearchActions(): void {
    // Each catalog tab's search bar is scoped to its own content — Live only
    // searches channels, Movies only movies, Series only series — so the
    // scope is forced from the input's own view rather than left to a
    // scope-picker the user could point at the wrong category.
    //
    // Live and Radio share one input (index.html mounts the same
    // `.catalog-search` block for both), so this one reads which of the two
    // is on screen. Same rule, just resolved at press time instead of at
    // authoring time — the alternative was a second input, a second data-fn
    // and a second copy of the clear button for a list that differs only in
    // which rows it holds.
    defineFn('search/setQueryChannels', (el) => {
        if (el instanceof HTMLInputElement) {
            setSearchScope(get<Route>(UI_ACTIVE_VIEW) === 'radio' ? 'radio' : 'channels');
            setSearchQuery(el.value);
        }
    });
    defineFn('search/setQueryMovies', (el) => {
        if (el instanceof HTMLInputElement) {
            setSearchScope('movies');
            setSearchQuery(el.value);
        }
    });
    defineFn('search/setQuerySeries', (el) => {
        if (el instanceof HTMLInputElement) {
            setSearchScope('series');
            setSearchQuery(el.value);
        }
    });
    defineFn('search/clear', () => {
        clearSearch();
    });
}

/**
 * Channels have no persisted `searchKey` field (`ChannelRow` is owned by
 * `src/m3u/`, out of this phase's `src/state/`-only scope) — so this module
 * builds its own small cache the first time a search touches a given row
 * array, keyed by reference identity: `liveDisplayRows()`/`radioDisplayRows()`
 * only return a *new* array when the underlying catalog is actually rebuilt
 * (source switch, a Live filter change), never on a keystroke, so this still
 * satisfies `src/search/README.md`'s "normalize once, score many times"
 * contract in practice. One cache per row source, since the two arrays are
 * rebuilt independently.
 */
function createSearchKeyCache(rowsOf: () => readonly ChannelRow[]): {
    keyFor: (row: ChannelRow) => string;
    reset: () => void;
} {
    let indexSource: readonly ChannelRow[] | null = null;
    let keys = new Map<string, string>();
    return {
        keyFor(row) {
            const rows = rowsOf();
            if (indexSource !== rows) {
                keys = new Map(rows.map((r) => [r.id, normalizeForSearch(r.name)]));
                indexSource = rows;
            }
            return keys.get(row.id) ?? '';
        },
        reset() {
            indexSource = null;
            keys = new Map();
        },
    };
}

const channelKeys = createSearchKeyCache(liveDisplayRows);
const radioKeys = createSearchKeyCache(radioDisplayRows);

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

/**
 * Widens (or narrows) the `movies`/`series` scopes to every configured
 * provider's swept catalog — `catalog-sweep.ts` owns the fetching and the
 * pool, this only decides which row source the ranking reads.
 */
export function setSearchAllSources(on: boolean, partial = false): void {
    currentAllSources = on;
    currentSweepPartial = partial;
    set(SEARCH_ALL_SOURCES, on);
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
    const wantRadio = scope === 'radio';
    const wantMovies = scope === 'movies' || scope === 'all';
    const wantSeries = scope === 'series' || scope === 'all';

    // Radio's rows are built on entering the view, but a recompute can also
    // arrive from elsewhere (`catalog-warm.ts`) — `ensureRadioRows()` is
    // memoized on its own inputs, so asking is free when they already exist.
    if (wantRadio) ensureRadioRows();
    const channelMatches = wantChannels
        ? rankSearch(query, liveDisplayRows(), channelKeys.keyFor, DEFAULT_SEARCH_LIMIT)
        : [];
    // The two scopes are mutually exclusive, so one of these is always empty
    // — kept as separate ranks rather than one row source picked by an `if`
    // so each keeps its own normalize-once cache.
    const radioMatches = wantRadio
        ? rankSearch(query, radioDisplayRows(), radioKeys.keyFor, DEFAULT_SEARCH_LIMIT)
        : [];
    // "Search all" only swaps the row source — same `rankSearch()`, same
    // pre-normalized `searchKey`, same limit, so a swept result is ranked by
    // exactly the rules a single-provider one is. An empty pool (a sweep
    // cancelled before anything landed) falls back to the loaded catalog
    // rather than showing nothing.
    const swept = currentAllSources;
    const vodPool = swept && sweptVodItems().length > 0 ? sweptVodItems() : allLoadedVodItems();
    const seriesPool = swept && sweptSeriesItems().length > 0 ? sweptSeriesItems() : allLoadedSeriesItems();

    const vodMatches = wantMovies
        ? rankSearch(query, vodPool, (item) => item.searchKey, DEFAULT_SEARCH_LIMIT)
        : [];
    const seriesMatches = wantSeries
        ? rankSearch(query, seriesPool, (item) => item.searchKey, DEFAULT_SEARCH_LIMIT)
        : [];

    const counts: SearchResultCounts = {
        channels: channelMatches.length + radioMatches.length,
        movies: vodMatches.length,
        series: seriesMatches.length,
    };
    // Search-all answers the coverage question differently: a swept pool
    // holds every category of every provider it reached, so what is left to
    // admit is whichever provider it did NOT reach (a failure, or a cancel).
    const loadedOnly = swept
        ? currentSweepPartial
        : (wantMovies && vodHasUnfetchedCategories()) || (wantSeries && seriesHasUnfetchedCategories());

    const rows: ChannelRow[] = [
        ...channelMatches,
        ...radioMatches,
        ...vodMatches.map((item) => vodResultRow(item)),
        ...seriesMatches.map((item) => seriesResultRow(item)),
    ].slice(0, DEFAULT_SEARCH_LIMIT);

    publishResults(rows, counts, loadedOnly);
}

/**
 * A swept result can belong to a provider that is not the active one, so
 * its playable URL has to be built from *that* provider's credentials and
 * its category named from *that* provider's catalog — the active source's
 * rail only knows its own. `sweptVodOwnership()` is `null` for everything
 * the pool has never seen, which is every row when search-all is off, so
 * this collapses back to the original single-source mapping.
 */
function vodResultRow(item: VodItem): ChannelRow {
    const ownership = sweptVodOwnership(item.streamId, item.categoryId);
    const category =
        ownership?.categoryName != null
            ? cleanCatalogDisplayName(ownership.categoryName)
            : vodCategoryName(item.categoryId);
    return vodItemToRow(
        item,
        ownership?.owner.source ?? cachedVodSource(),
        withProvider(ownership?.owner.name, category, sweptMultiSource('vod')),
    );
}

function seriesResultRow(item: SeriesItem): ChannelRow {
    const ownership = sweptSeriesOwnership(item.seriesId, item.categoryId);
    const category =
        ownership?.categoryName != null
            ? cleanCatalogDisplayName(ownership.categoryName)
            : seriesCategoryName(item.categoryId);
    return seriesItemToRow(item, withProvider(ownership?.owner.name, category, sweptMultiSource('series')));
}

/**
 * Which provider a result came from, folded into the row's existing
 * `group` line — the row shape already renders it, so provenance costs no
 * markup at all. Only shown once the pool actually holds more than one
 * provider: with a single source configured, naming it on every row is
 * noise.
 */
function withProvider(provider: string | undefined, category: string | null, multiSource: boolean): string | null {
    if (!multiSource || provider === undefined) return category;
    return category ? `${provider} · ${category}` : provider;
}

function publishResults(rows: ChannelRow[], counts: SearchResultCounts, loadedOnly: boolean): void {
    replace(SEARCH_RESULT_COUNTS, counts);
    set(SEARCH_LOADED_ONLY, loadedOnly);
    setDisplayedRows(rows);
}

/** Test-only: resets the module-level query/scope/row-index memory this file keeps outside Spektrum state. Never call from app code. */
export function resetSearchActionsForTests(): void {
    currentQuery = '';
    currentScope = 'all';
    currentAllSources = false;
    currentSweepPartial = false;
    channelKeys.reset();
    radioKeys.reset();
}
