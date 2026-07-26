import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { resetVirtualListForTests, setRows, setViewportHeight } from '../ui/virtual-list';
import { LIST_SELECTED_ID } from './list';
import { handleListKeydown, moveSelection, playSelected, selectChannel } from './list.actions';
import { PLAYER_ACTIVE } from './player';
import { get } from './typed';

function row(id: string): ChannelRow {
    return { id, name: `Channel ${id}`, url: `https://example.com/${id}.m3u8`, group: null, logo: null, tvgId: null, radio: false };
}

function keyEvent(key: string): KeyboardEvent {
    return new KeyboardEvent('keydown', { key });
}

describe('list.actions.ts selection (Feature 08.7)', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetState();
    });

    it('selectChannel() sets the selection cursor', () => {
        selectChannel('ch-1');
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('ch-1');
    });

    it('selectChannel(null) clears the selection', () => {
        selectChannel('ch-1');
        selectChannel(null);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBeNull();
    });

    it('moveSelection() is a no-op on an empty row set', () => {
        moveSelection(1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBeUndefined();
    });

    it('moveSelection(1) from no selection lands on the first row', () => {
        setRows([row('a'), row('b'), row('c')]);
        moveSelection(1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
    });

    it('moveSelection(-1) from no selection lands on the last row', () => {
        setRows([row('a'), row('b'), row('c')]);
        moveSelection(-1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('c');
    });

    it('moveSelection() clamps at both edges — never wraps', () => {
        setRows([row('a'), row('b')]);
        selectChannel('a');
        tick();
        moveSelection(-1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');

        selectChannel('b');
        tick();
        moveSelection(1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('b');
    });

    it('moveSelection() steps forward through consecutive rows', () => {
        setRows([row('a'), row('b'), row('c')]);
        selectChannel('a');
        tick();
        moveSelection(1);
        tick();
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('b');
    });

    it('playSelected() is a safe no-op with no active source (no id to attribute the snapshot to)', () => {
        setRows([row('a')]);
        selectChannel('a');
        tick();
        // playSelected() needs an active source id to build the snapshot —
        // exercised end-to-end via the real browser verification in the
        // Phase 08 tracker (Enter-to-play); this confirms the no-source
        // no-op path is safe rather than throwing or writing a malformed
        // snapshot.
        playSelected();
        tick();
        expect(get(PLAYER_ACTIVE)).toBeUndefined();
    });

    describe('handleListKeydown() dispatch table', () => {
        it('ignores an undefined event', () => {
            expect(() => handleListKeydown(undefined)).not.toThrow();
        });

        it('ArrowDown moves selection forward and prevents default', () => {
            setRows([row('a'), row('b')]);
            setViewportHeight(400);
            const event = keyEvent('ArrowDown');
            const preventSpy = vi.spyOn(event, 'preventDefault');
            handleListKeydown(event);
            tick();
            expect(preventSpy).toHaveBeenCalled();
            expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
        });

        it('an unhandled key is a no-op and does not preventDefault', () => {
            setRows([row('a')]);
            const event = keyEvent('a');
            const preventSpy = vi.spyOn(event, 'preventDefault');
            handleListKeydown(event);
            expect(preventSpy).not.toHaveBeenCalled();
        });
    });
});
