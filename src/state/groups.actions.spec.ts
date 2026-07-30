import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRows, setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { resetGroupCache } from '../ui/groups';
import { getAllRows, resetVirtualListForTests } from '../ui/virtual-list';
import { expandGroup, handleCategoryRailKeydown, handleGroupsPanelKeydown, showAllChannels } from './groups.actions';
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

    /**
     * The real rail's own classes, not bare siblings: ↑/↓ walk
     * `.groups-panel__item` inside a `.groups-panel` now, because the
     * catalog rails wrap each row (see `handleCategoryRailKeydown()`), and a
     * fixture that skipped them would prove the handler works on markup the
     * app never renders.
     */
    function makePanel(): { first: HTMLElement; second: HTMLElement } {
        const container = document.createElement('div');
        container.className = 'groups-panel';
        const first = document.createElement('button');
        const second = document.createElement('button');
        first.className = 'groups-panel__item';
        second.className = 'groups-panel__item';
        container.append(first, second);
        document.body.append(container);
        first.focus();
        return { first, second };
    }

    /** One catalog rail row: the category button plus the expand triangle beside it. */
    function makeAccordionPanel(): { item: HTMLElement; toggle: HTMLButtonElement } {
        const panel = document.createElement('div');
        panel.className = 'groups-panel';
        const row = document.createElement('div');
        row.className = 'groups-panel__row';
        const item = document.createElement('button');
        item.className = 'groups-panel__item';
        const toggle = document.createElement('button');
        toggle.className = 'groups-panel__toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
            toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
        });
        row.append(item, toggle);
        panel.append(row);
        document.body.append(panel);
        item.focus();
        return { item, toggle };
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

    /**
     * The Movies/Series category rails are the same `.groups-panel` markup
     * with a catalog behind it, so they share the focus movement — but
     * Backspace/← republishes *channel* rows, which from a catalog view
     * would silently swap the list out from under the viewer.
     */
    describe('handleCategoryRailKeydown() — the catalog rails share only the movement', () => {
        it('moves focus and activates exactly like the groups panel', () => {
            const { first, second } = makePanel();
            const clickSpy = vi.fn();
            first.addEventListener('click', clickSpy);

            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true);
            expect(document.activeElement).toBe(second);

            first.focus();
            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true);
            expect(clickSpy).toHaveBeenCalledOnce();
        });

        it('→/← open and close the focused category’s variants, and stop there', () => {
            const { item, toggle } = makeAccordionPanel();

            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(true);
            expect(toggle.getAttribute('aria-expanded')).toBe('true');
            expect(document.activeElement).toBe(item);

            // Already open: → is not ours, so focus can still travel out of
            // the rail rather than being swallowed.
            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe(false);

            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(true);
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(false);
        });

        it('leaves ← to the groups panel on a rail row with no variants', () => {
            const { first } = makePanel();
            first.focus();
            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe(false);
        });

        it('leaves Backspace alone instead of republishing the channel list', () => {
            setMemoryRows([row('1', 'News'), row('2', 'Sports')]);
            setActiveSourceId('p1');
            tick();
            expandGroup('News');
            tick();

            expect(handleCategoryRailKeydown(new KeyboardEvent('keydown', { key: 'Backspace' }))).toBe(false);
            tick();

            expect(get<string>(UI_VIEW_MODE)).toBe('groups');
        });
    });
});
