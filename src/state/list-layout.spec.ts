import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import {
    resetVirtualListForTests,
    setGridMode,
    setRows,
    setViewportHeight,
} from '../ui/virtual-list';
import type { ChannelRow } from '../m3u/types';
import { selectChannel, listHandlesHorizontal } from './list.actions';
import {
    DEFAULT_LIST_LAYOUT,
    initListLayoutModule,
    isGridLayout,
    UI_LIST_LAYOUT,
    type ListLayoutMap,
} from './list-layout';
import { setListLayout } from './list-layout.actions';
import { resetPersistForTests } from './persist';
import { get } from './typed';

function row(id: string): ChannelRow {
    return {
        id,
        name: `Channel ${id}`,
        url: '',
        group: null,
        logo: null,
        tvgId: null,
        radio: false,
    };
}

describe('isGridLayout()', () => {
    it('answers per view, so Movies can be a grid while Live stays a list', () => {
        const map: ListLayoutMap = { live: 'list', movies: 'grid', series: 'list' };
        expect(isGridLayout(map, 'movies')).toBe(true);
        expect(isGridLayout(map, 'live')).toBe(false);
    });

    it('falls back to the list layout for a view with no toggle, whatever is stored', () => {
        const map: ListLayoutMap = { live: 'grid', movies: 'grid', series: 'grid' };
        // Radio and Categories share the same virtual list but show no switch.
        expect(isGridLayout(map, 'radio')).toBe(false);
        expect(isGridLayout(map, 'categories')).toBe(false);
        expect(isGridLayout(map, undefined)).toBe(false);
    });

    it('falls back to the default for a scope missing from a stored value', () => {
        expect(isGridLayout({ movies: 'grid' }, 'live')).toBe(false);
        expect(isGridLayout(undefined, 'movies')).toBe(false);
    });
});

describe('setListLayout()', () => {
    afterEach(() => {
        resetPersistForTests();
        resetState();
    });

    it('changes one scope and leaves the others alone', () => {
        initListLayoutModule();
        tick();
        setListLayout('movies', 'grid');
        tick();
        expect(get<ListLayoutMap>(UI_LIST_LAYOUT)).toEqual({
            ...DEFAULT_LIST_LAYOUT,
            movies: 'grid',
        });
    });
});

describe('listHandlesHorizontal()', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetPersistForTests();
        resetState();
    });

    it('leaves Left/Right to spatial navigation in the list layout', () => {
        setRows([row('a'), row('b')]);
        setViewportHeight(400);
        selectChannel('b');
        tick();
        expect(listHandlesHorizontal('left')).toBe(false);
        expect(listHandlesHorizontal('right')).toBe(false);
    });

    it('claims a press between tiles on the same line, but never one at a line edge', () => {
        // An unmeasured container resolves to the two-column floor, which is
        // all this needs: column 0 and column 1 are both edges of a line.
        setGridMode('poster');
        setRows([row('a'), row('b'), row('c'), row('d'), row('e')]);
        setViewportHeight(400);

        selectChannel('a');
        tick();
        expect(listHandlesHorizontal('left')).toBe(false);
        expect(listHandlesHorizontal('right')).toBe(true);

        selectChannel('b');
        tick();
        expect(listHandlesHorizontal('left')).toBe(true);
        expect(listHandlesHorizontal('right')).toBe(false);

        // Last tile of a half-full line: there is no next item to move to.
        selectChannel('e');
        tick();
        expect(listHandlesHorizontal('right')).toBe(false);
    });
});
