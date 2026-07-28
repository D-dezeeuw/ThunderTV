import { resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearRows, setRows as setChannelMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { getAllRows } from '../ui/virtual-list';
import { get } from './typed';
import { ensureLiveRows } from './live-rows';
import { initSettingsState, SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_DROP_JUNK, SETTINGS_LIVE_KNOWN_ONLY } from './settings';
import { clearSearch, resetSearchActionsForTests, setSearchQuery, setSearchScope } from './search.actions';
import {
    initSearchState,
    SEARCH_LOADED_ONLY,
    SEARCH_QUERY,
    SEARCH_RESULT_COUNTS,
    type SearchResultCounts,
} from './search';
import { setCachedVodSource, toVodItem, vodMemory } from './vod-rows';
import { setCachedSeriesSource, toSeriesItem, seriesMemory } from './series-rows';

const fakeSource = { url: 'http://provider.example', user: 'u', pass: 'p' };

const channels: ChannelRow[] = [
    { id: 'c1', name: 'NPO 1', url: 'http://x/1', group: 'NL', logo: null, tvgId: null, radio: false },
    { id: 'c2', name: 'Sky News', url: 'http://x/2', group: 'UK', logo: null, tvgId: null, radio: false },
];

function seedChannels(): void {
    clearRows();
    setChannelMemoryRows(channels);
    setValue(SETTINGS_LIVE_COUNTRY, '');
    setValue(SETTINGS_LIVE_KNOWN_ONLY, false);
    setValue(SETTINGS_LIVE_DROP_JUNK, false);
    tick();
    ensureLiveRows(true);
}

function seedVodAndSeries(): void {
    vodMemory.setCategories([{ id: '1', name: 'Movies' }]);
    vodMemory.setCategoriesFetchedAt(Date.now());
    vodMemory.setItemsFor(
        '1',
        [toVodItem({ streamId: 1, name: 'Napoleon', categoryId: '1', containerExtension: 'mp4' })],
        Date.now(),
    );
    setCachedVodSource(fakeSource);

    seriesMemory.setCategories([{ id: '1', name: 'Shows' }]);
    seriesMemory.setCategoriesFetchedAt(Date.now());
    seriesMemory.setItemsFor('1', [toSeriesItem({ seriesId: 1, name: 'Napoleon Diaries', categoryId: '1' })], Date.now());
    setCachedSeriesSource(fakeSource);
}

describe('search.actions', () => {
    beforeEach(() => {
        initSettingsState();
        initSearchState();
        seedChannels();
        seedVodAndSeries();
    });

    afterEach(() => {
        vodMemory.reset();
        seriesMemory.reset();
        clearRows();
        resetSearchActionsForTests();
        resetState();
    });

    it('an empty query publishes zero rows/counts without ranking anything', () => {
        setSearchScope('channels');
        setSearchQuery('   ');
        tick();

        const counts = get<SearchResultCounts>(SEARCH_RESULT_COUNTS);
        expect(counts).toEqual({ channels: 0, movies: 0, series: 0 });
        expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(false);
    });

    it('"channels" scope only ranks the live channel catalog', () => {
        setSearchScope('channels');
        setSearchQuery('npo');
        tick();

        const counts = get<SearchResultCounts>(SEARCH_RESULT_COUNTS);
        expect(counts).toEqual({ channels: 1, movies: 0, series: 0 });
        expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(false);
    });

    it('"movies" scope only ranks loaded VOD items, and flags loadedOnly when a category is unfetched', () => {
        setSearchScope('movies');
        setSearchQuery('napoleon');
        tick();

        expect(get<SearchResultCounts>(SEARCH_RESULT_COUNTS)).toEqual({ channels: 0, movies: 1, series: 0 });
        expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(false);

        // A second, never-fetched category makes the catalog incomplete.
        vodMemory.setCategories([{ id: '1', name: 'Movies' }, { id: '2', name: 'More Movies' }]);
        setSearchQuery('napoleon');
        tick();
        expect(get<boolean>(SEARCH_LOADED_ONLY)).toBe(true);
    });

    it('"all" scope concatenates channels, then movies, then series, each capped', () => {
        setSearchScope('all');
        setSearchQuery('napoleon');
        tick();

        const counts = get<SearchResultCounts>(SEARCH_RESULT_COUNTS);
        expect(counts).toEqual({ channels: 0, movies: 1, series: 1 });
    });

    it('"all" scope publishes channel rows, then movie rows, then series rows, sharing the same query', () => {
        // Rename a channel so all three scopes match the same query.
        setChannelMemoryRows([{ ...channels[0]!, name: 'Napoleon Channel' }, channels[1]!]);
        ensureLiveRows(true);

        setSearchScope('all');
        setSearchQuery('napoleon');
        tick();

        expect(get<SearchResultCounts>(SEARCH_RESULT_COUNTS)).toEqual({ channels: 1, movies: 1, series: 1 });
        expect(getAllRows().map((r) => r.id)).toEqual(['c1', 'vod:1', 'series:1']);
    });

    it('clearSearch() resets the query and publishes an empty result set', () => {
        setSearchScope('all');
        setSearchQuery('napoleon');
        tick();
        expect(get<string>(SEARCH_QUERY)).toBe('napoleon');

        clearSearch();
        tick();

        expect(get<string>(SEARCH_QUERY)).toBe('');
        expect(get<SearchResultCounts>(SEARCH_RESULT_COUNTS)).toEqual({ channels: 0, movies: 0, series: 0 });
    });
});
