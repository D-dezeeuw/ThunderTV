import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { resetVirtualListForTests } from '../ui/virtual-list';
import type { FavoriteRecord } from '../core/storage';
import { FAVORITES_ROWS } from './favorites';
import { playFavorite } from './favorites.actions';
import { LIST_SELECTED_ID } from './list';
import { setDisplayedRows } from './list-rows';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY } from './player';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { playFromHistory } from './recent.actions';
import type { ActiveChannelSnapshot } from './records';
import { get } from './typed';

/**
 * "Selecting a recent or starred radio/TV entry jumps to that tab but
 * nothing happens." Both entry points hand the player a full snapshot, so
 * this pins the two things that have to be true afterwards: the channel is
 * the active one, and the list cursor is on it.
 */
const SNAPSHOT: ActiveChannelSnapshot = {
    id: 'src-1:7',
    sourceId: 'src-1',
    name: 'NPO 1',
    streamUrl: 'http://example.test/live/7.m3u8',
    logo: null,
    group: null,
};

function favorite(over: Partial<FavoriteRecord> = {}): FavoriteRecord {
    return { v: 1, id: SNAPSHOT.id, sourceId: 'src-1', name: 'NPO 1', streamUrl: SNAPSHOT.streamUrl, logo: null, group: null, addedAt: 1, ...over };
}

function listRow(id: string): ChannelRow {
    return { id, name: id, url: `http://example.test/${id}.m3u8`, group: null, logo: null, tvgId: null, radio: false };
}

describe('replaying a Starred or Recent entry', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetState();
    });

    function seedList(): void {
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
        tick();
        // A published list that contains the channel, plus a cursor parked
        // somewhere else — the state a viewer is actually in when they open
        // Starred from a different row.
        setDisplayedRows([listRow('src-1:1'), listRow(SNAPSHOT.id), listRow('src-1:9')]);
        tick();
        setValue(LIST_SELECTED_ID, 'src-1:1');
        tick();
    }

    it('makes a starred channel the active one', () => {
        seedList();
        setValue(FAVORITES_ROWS, [favorite()]);
        tick();

        playFavorite(SNAPSHOT.id);
        tick();

        expect(get<ActiveChannelSnapshot>(PLAYER_ACTIVE)?.streamUrl).toBe(SNAPSHOT.streamUrl);
    });

    it('moves the list cursor onto the starred channel', () => {
        seedList();
        setValue(FAVORITES_ROWS, [favorite()]);
        tick();

        playFavorite(SNAPSHOT.id);
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBe(SNAPSHOT.id);
    });

    it('makes a recent channel the active one', () => {
        seedList();
        setValue(PLAYER_ZAP_HISTORY, [SNAPSHOT]);
        tick();

        playFromHistory(SNAPSHOT.id);
        tick();

        expect(get<ActiveChannelSnapshot>(PLAYER_ACTIVE)?.streamUrl).toBe(SNAPSHOT.streamUrl);
    });

    it('moves the list cursor onto the recent channel too', () => {
        seedList();
        setValue(PLAYER_ZAP_HISTORY, [SNAPSHOT]);
        tick();

        playFromHistory(SNAPSHOT.id);
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBe(SNAPSHOT.id);
    });

    /**
     * The target view republishes its rows on arrival, and that republish
     * re-derives the cursor. It must not throw away the selection the
     * replay just made.
     */
    it('keeps the cursor on the channel when the target view republishes its rows', () => {
        seedList();
        setValue(FAVORITES_ROWS, [favorite()]);
        tick();

        playFavorite(SNAPSHOT.id);
        tick();
        setDisplayedRows([listRow('src-1:1'), listRow(SNAPSHOT.id), listRow('src-1:9')]);
        tick();

        expect(get<string | null>(LIST_SELECTED_ID)).toBe(SNAPSHOT.id);
    });
});

/**
 * The realistic case on Live: the aggressive Live filter means a starred or
 * recently-watched channel is very often *not* in the row set the target
 * view publishes (on the demo playlist, 26k provider rows collapse to ~131
 * visible channels). The replay must still play it.
 */
describe('replaying a channel the target view does not list', () => {
    afterEach(() => {
        resetVirtualListForTests();
        resetState();
    });

    it('still plays it', () => {
        setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
        tick();
        setValue(FAVORITES_ROWS, [favorite()]);
        tick();

        playFavorite(SNAPSHOT.id);
        tick();
        // The target view republishes a filtered set that excludes it.
        setDisplayedRows([listRow('src-1:1'), listRow('src-1:9')]);
        tick();

        // The cursor has nowhere correct to go here — the row genuinely is
        // not in this view — so it keeps its existing "land on the first row"
        // behaviour. What must not break is the playback itself.
        expect(get<ActiveChannelSnapshot>(PLAYER_ACTIVE)?.streamUrl).toBe(SNAPSHOT.streamUrl);
    });
});
