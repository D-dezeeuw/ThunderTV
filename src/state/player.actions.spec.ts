import { appState, bindDOM, getPathObj, resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { flushNow, pendingKeys } from './persist';
import { registerPlayerActions, setActiveChannel } from './player.actions';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import type { ActiveChannelSnapshot } from './records';

function channel(id: string): ActiveChannelSnapshot {
    return { id, sourceId: 'src-1', name: `Channel ${id}`, streamUrl: `https://example.test/${id}`, logo: null, group: null };
}

function activePlayer(): ActiveChannelSnapshot | null | undefined {
    return getPathObj<ActiveChannelSnapshot | null>(appState, PLAYER_ACTIVE);
}

function zapHistory(): ActiveChannelSnapshot[] | undefined {
    return getPathObj<ActiveChannelSnapshot[]>(appState, PLAYER_ZAP_HISTORY);
}

describe('setActiveChannel (Feature 05.2.2/05.5.1-05.5.3)', () => {
    afterEach(() => {
        resetState();
    });

    it('denormalizes the full channel snapshot into player.active — not an id', () => {
        const ch = channel('1');
        setActiveChannel(ch);
        tick();
        expect(activePlayer()).toEqual(ch);
    });

    it('pushes the new channel to the front of player.zapHistory', () => {
        setActiveChannel(channel('1'));
        tick();
        setActiveChannel(channel('2'));
        tick();
        expect(zapHistory()?.map((c) => c.id)).toEqual(['2', '1']);
    });

    it('dedupes a re-zapped channel to the front instead of appearing twice', () => {
        setActiveChannel(channel('1'));
        tick();
        setActiveChannel(channel('2'));
        tick();
        setActiveChannel(channel('1'));
        tick();
        expect(zapHistory()?.map((c) => c.id)).toEqual(['1', '2']);
    });

    it(`caps zap history at ${String(ZAP_HISTORY_CAP)} entries`, () => {
        for (let i = 0; i < ZAP_HISTORY_CAP + 5; i += 1) {
            setActiveChannel(channel(String(i)));
            tick();
        }
        expect(zapHistory()).toHaveLength(ZAP_HISTORY_CAP);
        // Oldest (id "0"..."4") evicted; newest survives at the front.
        expect(zapHistory()?.[0]?.id).toBe(String(ZAP_HISTORY_CAP + 4));
        expect(zapHistory()?.some((c) => c.id === '0')).toBe(false);
    });

    it('marks both player.active and player.zapHistory dirty for the persistence bridge', () => {
        setActiveChannel(channel('1'));
        tick();
        expect(pendingKeys().sort()).toEqual([PLAYER_ACTIVE, PLAYER_ZAP_HISTORY].sort());
    });

    it('round-trips through the persistence bridge as a versioned envelope', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            setActiveChannel(channel('1'));
            tick();
            await flushNow();

            expect(await storage.get(PLAYER_ACTIVE)).toEqual({ v: 1, data: channel('1') });
            expect(await storage.get(PLAYER_ZAP_HISTORY)).toEqual({ v: 1, data: [channel('1')] });
        });
    });
});

describe('player/setActiveChannel defineFn registration (Feature 05.2.1)', () => {
    afterEach(() => {
        resetState();
    });

    it('wires data-fn="player/setActiveChannel" through to setActiveChannel, proving the mechanism is complete', () => {
        registerPlayerActions();
        const btn = document.createElement('button');
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'player/setActiveChannel');
        // Spektrum's data-value only coerces primitives (bool/number/string
        // — see the vendored engine's value-coercion helper); a real
        // ActiveChannelSnapshot object is never constructible from markup
        // alone. This click proves the defineFn -> handler -> setActiveChannel
        // wiring fires end-to-end; setActiveChannel() itself (tested above)
        // remains the real, typed entry point a future click handler will
        // call once Phase 06+ renders real channel rows.
        btn.setAttribute('data-value', 'probe-id');
        document.body.appendChild(btn);
        const destroy = bindDOM(document.body);

        btn.click();
        tick();

        expect(getPathObj(appState, PLAYER_ACTIVE)).toBe('probe-id');

        destroy();
        btn.remove();
    });
});
