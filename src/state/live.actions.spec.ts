import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { getAllRows, resetVirtualListForTests } from '../ui/virtual-list';
import { FAVORITES_IDS, initFavoritesState } from './favorites';
import { publishRowsForCurrentView, registerViewRowsWatch } from './live.actions';
import { set } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

const ROWS: ChannelRow[] = [
    { id: 'p1:0', name: 'News Channel', url: 'https://example.com/news.m3u8', group: 'News', logo: null, tvgId: null, radio: false },
    { id: 'p1:1', name: 'Sports Channel', url: 'https://example.com/sports.m3u8', group: 'Sports', logo: null, tvgId: null, radio: false },
];

describe('favorites view (publishRowsForCurrentView)', () => {
    afterEach(() => {
        resetVirtualListForTests();
        setMemoryRows([]);
        resetState();
    });

    it('shows only starred channels when the favorites route is active', () => {
        initFavoritesState();
        setMemoryRows(ROWS);
        set(UI_ACTIVE_VIEW, 'favorites');
        set(FAVORITES_IDS, { 'p1:0': true });
        tick();

        publishRowsForCurrentView();

        expect(getAllRows().map((r) => r.id)).toEqual(['p1:0']);
    });

    it('live-updates the favorites list when a favorite is toggled while the tab is open', () => {
        const stop = registerViewRowsWatch();
        try {
            initFavoritesState();
            setMemoryRows(ROWS);
            set(UI_ACTIVE_VIEW, 'favorites');
            tick();

            expect(getAllRows()).toHaveLength(0);

            set(FAVORITES_IDS, { 'p1:1': true });
            tick();

            expect(getAllRows().map((r) => r.id)).toEqual(['p1:1']);
        } finally {
            stop();
        }
    });
});
