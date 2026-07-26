import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRows, setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { resetGroupCache } from '../ui/groups';
import { getAllRows, resetVirtualListForTests } from '../ui/virtual-list';
import { expandGroup, handleGroupsPanelKeydown, showAllChannels } from './groups.actions';
import { UI_ACTIVE_GROUP, UI_VIEW_MODE } from './list-state';
import { setActiveSourceId } from './playlist.actions';
import { get } from './typed';

function row(id: string, group: string | null): ChannelRow {
    return { id, name: `Channel ${id}`, url: `https://example.com/${id}.m3u8`, group, logo: null, tvgId: null, radio: false };
}

describe('expandGroup()/showAllChannels() (Feature 08.5.3/08.5.5)', () => {
    afterEach(() => {
        clearRows();
        resetGroupCache();
        resetVirtualListForTests();
        resetState();
    });

    it('expandGroup() filters the displayed rows to just that group and flips view mode', () => {
        setMemoryRows([row('1', 'News'), row('2', 'Sports'), row('3', 'News')]);
        setActiveSourceId('p1');
        tick();

        expandGroup('News');
        tick();

        expect(getAllRows().map((r) => r.id)).toEqual(['1', '3']);
        expect(get<string>(UI_VIEW_MODE)).toBe('groups');
        expect(get<string | null>(UI_ACTIVE_GROUP)).toBe('News');
    });

    it('expandGroup() is a no-op with no active source', () => {
        setMemoryRows([row('1', 'News')]);
        expandGroup('News');
        tick();
        expect(getAllRows()).toEqual([]);
    });

    it('showAllChannels() restores the full unfiltered row set and clears the active group', () => {
        setMemoryRows([row('1', 'News'), row('2', 'Sports')]);
        setActiveSourceId('p1');
        tick();
        expandGroup('News');
        tick();

        showAllChannels();
        tick();

        expect(getAllRows().map((r) => r.id)).toEqual(['1', '2']);
        expect(get<string>(UI_VIEW_MODE)).toBe('all');
        expect(get<string | null>(UI_ACTIVE_GROUP)).toBeNull();
    });
});

describe('handleGroupsPanelKeydown() (Feature 08.5.8)', () => {
    afterEach(() => {
        clearRows();
        resetGroupCache();
        resetVirtualListForTests();
        resetState();
        document.body.innerHTML = '';
    });

    function makePanel(): { first: HTMLElement; second: HTMLElement } {
        const container = document.createElement('div');
        const first = document.createElement('button');
        const second = document.createElement('button');
        container.append(first, second);
        document.body.append(container);
        first.focus();
        return { first, second };
    }

    it('ignores an undefined event', () => {
        expect(() => handleGroupsPanelKeydown(undefined)).not.toThrow();
    });

    it('ArrowDown moves focus to the next sibling button', () => {
        const { second } = makePanel();
        handleGroupsPanelKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(document.activeElement).toBe(second);
    });

    it('ArrowUp moves focus to the previous sibling button', () => {
        const { first, second } = makePanel();
        second.focus();
        handleGroupsPanelKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(document.activeElement).toBe(first);
    });

    it('Enter clicks the focused button', () => {
        const { first } = makePanel();
        const clickSpy = vi.fn();
        first.addEventListener('click', clickSpy);
        handleGroupsPanelKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(clickSpy).toHaveBeenCalledOnce();
    });

    it('Backspace returns to all channels', () => {
        setMemoryRows([row('1', 'News'), row('2', 'Sports')]);
        setActiveSourceId('p1');
        tick();
        expandGroup('News');
        tick();

        handleGroupsPanelKeydown(new KeyboardEvent('keydown', { key: 'Backspace' }));
        tick();

        expect(get<string>(UI_VIEW_MODE)).toBe('all');
    });
});
