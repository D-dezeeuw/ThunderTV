import { setValue } from 'spektrum';

/**
 * Scoped fuzzy search across Live channels, the Movies catalog, and the
 * Series catalog (Phase 21/09) — thin Spektrum surface over
 * `src/search/`'s pure `rankSearch()`; the actual matching logic lives
 * there, never here. Nothing here is persisted: a search is a live,
 * disposable session activity, reset on every boot like `ui.settingsOpen`.
 */
export const SEARCH_QUERY = 'search.query';
export const SEARCH_SCOPE = 'search.scope';
export const SEARCH_ACTIVE = 'search.active';
/** Per-scope match counts, published alongside the row set — lets the UI show "12 channels, 3 movies, 0 series" without recounting the published rows itself. */
export const SEARCH_RESULT_COUNTS = 'search.resultCounts';
/** True when the current scope's results are known-incomplete because not every relevant category has been fetched yet (`movies`/`series` only — see `search.actions.ts`'s `recomputeSearch()`). Always `false` for `channels`, which is always fully loaded. */
export const SEARCH_LOADED_ONLY = 'search.loadedOnly';

/**
 * `'radio'` is `'channels'` pointed at the other row set: Radio's stations are
 * `ChannelRow`s like any other, they just live in `live-rows.ts`'s radio
 * array. It is a scope of its own rather than a flag on `'channels'` because
 * the two lists are disjoint — searching Radio must never surface a TV channel
 * the Radio tab cannot show. Both report into `resultCounts.channels`.
 */
export type SearchScope = 'channels' | 'radio' | 'movies' | 'series' | 'all';

export function isSearchScope(value: unknown): value is SearchScope {
    return (
        value === 'channels' || value === 'radio' || value === 'movies' || value === 'series' || value === 'all'
    );
}

export interface SearchResultCounts {
    channels: number;
    movies: number;
    series: number;
}

export interface SearchState {
    query: string;
    scope: SearchScope;
    active: boolean;
    resultCounts: SearchResultCounts;
    loadedOnly: boolean;
}

export const SEARCH_DEFAULTS: SearchState = {
    query: '',
    scope: 'all',
    active: false,
    resultCounts: { channels: 0, movies: 0, series: 0 },
    loadedOnly: false,
};

export function initSearchState(): void {
    setValue(SEARCH_QUERY, SEARCH_DEFAULTS.query);
    setValue(SEARCH_SCOPE, SEARCH_DEFAULTS.scope);
    setValue(SEARCH_ACTIVE, SEARCH_DEFAULTS.active);
    setValue(SEARCH_RESULT_COUNTS, SEARCH_DEFAULTS.resultCounts);
    setValue(SEARCH_LOADED_ONLY, SEARCH_DEFAULTS.loadedOnly);
}
