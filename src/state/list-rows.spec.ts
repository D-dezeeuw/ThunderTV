import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { resetVirtualListForTests } from '../ui/virtual-list';
import { LIST_SELECTED_ID } from './list';
import { setDisplayedRows } from './list-rows';
import { get } from './typed';

function row(id: string): ChannelRow {
    return { id, name: `Channel ${id}`, url: `https://example.com/${id}.m3u8`, group: null, logo: null, tvgId: null, radio: false };
}

describe('setDisplayedRows() (Feature 08.10.4/08.7.9)', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetState();
    });

    it('selects the first row when nothing was previously selected', () => {
        setDisplayedRows([row('a'), row('b')]);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
    });

    it('preserves the current selection when it still exists in the new row set', () => {
        setDisplayedRows([row('a'), row('b')]);
        tick();
        setDisplayedRows([row('c'), row('b'), row('a')]);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
    });

    it('falls back to the first row when the selected id is not in the new set (Feature 08.7.9)', () => {
        setDisplayedRows([row('a'), row('b')]);
        tick();
        setDisplayedRows([row('c'), row('d')]);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('c');
    });

    it('selects null for an empty row set', () => {
        setDisplayedRows([row('a')]);
        tick();
        setDisplayedRows([]);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBeNull();
    });

    it('honors an explicit selectedId option even when it differs from the live selection (restore path)', () => {
        setDisplayedRows([row('a'), row('b'), row('c')]);
        tick();
        setDisplayedRows([row('a'), row('b'), row('c')], { selectedId: 'c' });
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('c');
    });

    it('an explicit selectedId not present in the row set still falls back to the first row', () => {
        setDisplayedRows([row('a'), row('b')], { selectedId: 'ghost' });
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
    });
});
