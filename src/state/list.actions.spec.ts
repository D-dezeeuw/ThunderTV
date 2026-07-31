import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { resetVirtualListForTests, setRows, setViewportHeight } from '../ui/virtual-list';
import { LIST_SELECTED_ID } from './list';
import { handleListKeydown, handleRowTap, moveSelection, playSelected, preselectFirstLiveChannel, selectChannel } from './list.actions';
import { resetPersistForTests } from './persist';
import { PLAYER_ACTIVE } from './player';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';
import type { ActiveChannelSnapshot } from './records';
import { SERIES_DETAIL_ID, type SeriesItem } from './series';
import { makeSeriesRowId, resetSeriesMemoryForTests, seriesMemory } from './series-rows';
import { VOD_DETAIL_ID, type VodItem } from './vod';
import { makeVodRowId, resetVodMemoryForTests, vodMemory } from './vod-rows';

function row(id: string): ChannelRow {
    return { id, name: `Channel ${id}`, url: `https://example.com/${id}.m3u8`, group: null, logo: null, tvgId: null, radio: false };
}

function keyEvent(key: string): KeyboardEvent {
    return new KeyboardEvent('keydown', { key });
}

describe('list.actions.ts selection (Feature 08.7)', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetPersistForTests();
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

    it('preselectFirstLiveChannel() selects the first row when on Live with an active source', () => {
        setValue(UI_ACTIVE_VIEW, 'live');
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 's1');
        setRows([row('a'), row('b')]);
        tick();

        preselectFirstLiveChannel();
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
    });

    it('preselectFirstLiveChannel() does nothing off the Live view (never overrides a deep link)', () => {
        setValue(UI_ACTIVE_VIEW, 'movies');
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 's1');
        setRows([row('a')]);
        tick();

        preselectFirstLiveChannel();
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBeUndefined();
    });

    it('preselectFirstLiveChannel() does nothing without an active source', () => {
        setValue(UI_ACTIVE_VIEW, 'live');
        setRows([row('a')]);
        tick();

        preselectFirstLiveChannel();
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBeUndefined();
    });

    it('preselectFirstLiveChannel() is a safe no-op on an empty row set', () => {
        setValue(UI_ACTIVE_VIEW, 'live');
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 's1');
        tick();

        preselectFirstLiveChannel();
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBeUndefined();
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

    describe('handleRowTap() (click/tap-to-play, every pointer type)', () => {
        it('a click/tap selects AND plays the row', () => {
            setRows([row('a'), row('b')]);
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
            tick();
            handleRowTap('b');
            tick();
            expect(get<string | null>(LIST_SELECTED_ID)).toBe('b');
            expect(get<ActiveChannelSnapshot>(PLAYER_ACTIVE)).toMatchObject({ id: 'b', sourceId: 'src-1' });
        });

        it('with no active source, a tap still selects and playing is a safe no-op', () => {
            setRows([row('a')]);
            handleRowTap('a');
            tick();
            expect(get<string | null>(LIST_SELECTED_ID)).toBe('a');
            expect(get(PLAYER_ACTIVE)).toBeUndefined();
        });
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

    describe('playSelected() Phase 21 catalog routing — Enter on a Movies/Series row opens its detail instead of playing it', () => {
        afterEach(() => {
            resetVodMemoryForTests();
            resetSeriesMemoryForTests();
        });

        it("a 'vod:' row id opens the movie detail via openVodDetail(), never player.active", () => {
            const item: VodItem = { streamId: 42, name: 'Movie', categoryId: '1', containerExtension: 'mp4', searchKey: 'movie' };
            vodMemory.setItemsFor('1', [item], Date.now());
            setValue(LIST_SELECTED_ID, makeVodRowId(42));
            tick();

            playSelected();
            tick();

            expect(get<number | null>(VOD_DETAIL_ID)).toBe(42);
            expect(get(PLAYER_ACTIVE)).toBeUndefined();
        });

        it("a 'series:' row id opens the series detail via openSeriesDetail(), never player.active", () => {
            const item: SeriesItem = { seriesId: 7, name: 'Show', categoryId: '1', searchKey: 'show' };
            seriesMemory.setItemsFor('1', [item], Date.now());
            setValue(LIST_SELECTED_ID, makeSeriesRowId(7));
            tick();

            playSelected();
            tick();

            expect(get<number | null>(SERIES_DETAIL_ID)).toBe(7);
            expect(get(PLAYER_ACTIVE)).toBeUndefined();
        });

        it('a plain (live/radio) row id is completely unaffected — still routes through playChannelById', () => {
            setRows([row('a')]);
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
            selectChannel('a');
            tick();

            playSelected();
            tick();

            expect(get<ActiveChannelSnapshot>(PLAYER_ACTIVE)).toMatchObject({ id: 'a', sourceId: 'src-1' });
            expect(get<number | null>(VOD_DETAIL_ID)).toBeUndefined();
            expect(get<number | null>(SERIES_DETAIL_ID)).toBeUndefined();
        });
    });
});
