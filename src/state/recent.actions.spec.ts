import { setValue, tick } from 'spektrum';
import { beforeEach, describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY } from './player';
import { setActiveChannel } from './player.actions';
import { playFromHistory, viewForSnapshot } from './recent.actions';
import type { ActiveChannelSnapshot } from './records';
import { get } from './typed';

/**
 * Recents listed what you had watched and did nothing with it — the rows
 * were plain text. They replay now, straight from the snapshot, which is
 * what makes the view work on a cold boot before any source has loaded.
 */

const NPO: ActiveChannelSnapshot = {
    id: 'ch-1',
    sourceId: 's',
    name: 'NPO 1',
    streamUrl: 'http://provider.test/1.ts',
    logo: null,
    group: '┃NL┃ NEDERLAND HD',
};

const SLAM: ActiveChannelSnapshot = {
    id: 'ch-2',
    sourceId: 's',
    name: 'SLAM!',
    streamUrl: 'http://provider.test/2.ts',
    logo: null,
    group: '┃NL┃ MUZIEK',
    radio: true,
};

beforeEach(() => {
    location.hash = '';
});

describe('viewForSnapshot', () => {
    it('sends a station to Radio and everything else to Live', () => {
        expect(viewForSnapshot(SLAM)).toBe('radio');
        expect(viewForSnapshot(NPO)).toBe('live');
        // Entries persisted before the flag existed are television.
        const withoutFlag: ActiveChannelSnapshot = { ...SLAM };
        delete withoutFlag.radio;
        expect(viewForSnapshot(withoutFlag)).toBe('live');
    });
});

describe('playFromHistory', () => {
    it('replays the snapshot and lands on the view that can show it', () => {
        const mounted = mountTemplate('<div></div>');

        setValue(PLAYER_ZAP_HISTORY, [SLAM, NPO]);
        tick();

        playFromHistory('ch-1');
        tick();
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.streamUrl).toBe('http://provider.test/1.ts');
        expect(location.hash).toBe('#/live');

        playFromHistory('ch-2');
        tick();
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.name).toBe('SLAM!');
        expect(location.hash).toBe('#/radio');

        mounted.cleanup();
    });

    it('ignores an id that is not in the history', () => {
        const mounted = mountTemplate('<div></div>');
        setValue(PLAYER_ZAP_HISTORY, [NPO]);
        setActiveChannel(NPO);
        tick();

        playFromHistory('nope');
        tick();
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.id).toBe('ch-1');

        mounted.cleanup();
    });
});

describe('the Recents rows themselves', () => {
    it('renders one clickable row per entry and replays the one that was clicked', () => {
        const mounted = mountTemplate(`
            <ul data-each="player.zapHistory" data-action="click" data-fn="recent/play" data-testid="list">
                <li>
                    <button
                        :class="{ 'is-active': player.active && player.active.id === item.id }"
                        :data-id="item.id"
                        data-testid="row"
                    >{{ item.name }}</button>
                </li>
            </ul>
        `);

        setValue(PLAYER_ZAP_HISTORY, [SLAM, NPO]);
        tick();

        const rows = mounted.queryAll('[data-testid="row"]');
        expect(rows.map((r) => r.textContent)).toEqual(['SLAM!', 'NPO 1']);

        rows[1]?.click();
        tick();
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.name).toBe('NPO 1');
        expect(location.hash).toBe('#/live');

        // Replaying is watching, so the entry moves to the head of the
        // history — and the row that is playing is marked, so the list says
        // where you are.
        const after = mounted.queryAll('[data-testid="row"]');
        expect(after.map((r) => r.textContent)).toEqual(['NPO 1', 'SLAM!']);
        expect(after[0]?.classList.contains('is-active')).toBe(true);
        expect(after[1]?.classList.contains('is-active')).toBe(false);

        mounted.cleanup();
    });
});
