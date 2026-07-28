import { appState, bindDOM, getPathObj, refs, resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeWindowFullscreen, withFakePlatform } from '../core/platform/fake-platform';
import { flushNow, pendingKeys } from './persist';
import { registerPlayerActions, setActiveChannel, togglePlayerFullscreen } from './player.actions';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import type { ActiveChannelSnapshot } from './records';
import { UI_ACTIVE_VIEW } from './ui';

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

/**
 * The desktop bug these cover: Electron routes `requestFullscreen()`
 * through the session permission handler, and `desktop/main.mjs` used to
 * deny every permission — so the button did nothing at all. The permission
 * is allowed now; this is the belt to that braces. Where the host owns its
 * own window, a refusal for *any* reason falls back to fullscreening the
 * window itself, which is a perfectly good answer to "make this big."
 */
describe('togglePlayerFullscreen', () => {
    function stubFullscreenElement(value: Element | null): void {
        Object.defineProperty(document, 'fullscreenElement', { value, configurable: true, writable: true });
    }

    function mountVideo(requestFullscreen?: () => void): HTMLVideoElement {
        const video = document.createElement('video');
        if (requestFullscreen) {
            (video as unknown as Record<string, unknown>)['requestFullscreen'] = requestFullscreen;
        }
        refs['playerVideo'] = video;
        return video;
    }

    afterEach(() => {
        stubFullscreenElement(null);
        delete refs['playerVideo'];
        delete refs['radioVisualizer'];
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetState();
    });

    it('requests fullscreen on the video, and never reaches for a host window on web', async () => {
        await withFakePlatform({}, () => {
            const request = vi.fn();
            mountVideo(request);
            stubFullscreenElement(null);

            togglePlayerFullscreen();

            expect(request).toHaveBeenCalledOnce();
        });
    });

    it('falls back to the desktop window when nothing on the page took fullscreen', async () => {
        vi.useFakeTimers();
        await withFakePlatform({}, ({ platform }) => {
            const host = new FakeWindowFullscreen();
            platform.windowFullscreen = host;
            // No `requestFullscreen` on the element at all — the same
            // outcome a denied permission produces.
            mountVideo();
            stubFullscreenElement(null);

            togglePlayerFullscreen();
            expect(host.calls).toEqual([]);

            vi.runAllTimers();
            expect(host.calls).toEqual([true]);
        });
    });

    it('leaves the window alone when page fullscreen did take', async () => {
        vi.useFakeTimers();
        await withFakePlatform({}, ({ platform }) => {
            const host = new FakeWindowFullscreen();
            platform.windowFullscreen = host;
            const video = mountVideo(() => {
                stubFullscreenElement(video);
            });
            stubFullscreenElement(null);

            togglePlayerFullscreen();
            vi.runAllTimers();

            expect(host.calls).toEqual([]);
        });
    });

    it('exits the window fullscreen it entered, rather than requesting page fullscreen again', async () => {
        await withFakePlatform({}, ({ platform }) => {
            const host = new FakeWindowFullscreen();
            host.setFullscreen(true);
            platform.windowFullscreen = host;
            const request = vi.fn();
            mountVideo(request);
            stubFullscreenElement(null);

            togglePlayerFullscreen();

            expect(host.calls).toEqual([true, false]);
            expect(request).not.toHaveBeenCalled();
        });
    });

    it('exits page fullscreen first, whatever the host is', async () => {
        await withFakePlatform({}, ({ platform }) => {
            const host = new FakeWindowFullscreen();
            platform.windowFullscreen = host;
            const exit = vi.fn();
            Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
            const video = mountVideo(vi.fn());
            stubFullscreenElement(video);

            togglePlayerFullscreen();

            expect(exit).toHaveBeenCalledOnce();
            expect(host.calls).toEqual([]);
        });
    });

    it('fullscreens the whole player shell in Radio, not the collapsed video', async () => {
        await withFakePlatform({}, () => {
            const shell = document.createElement('div');
            shell.className = 'player-shell';
            const canvas = document.createElement('canvas');
            shell.appendChild(canvas);
            document.body.appendChild(shell);
            const shellRequest = vi.fn();
            (shell as unknown as Record<string, unknown>)['requestFullscreen'] = shellRequest;
            refs['radioVisualizer'] = canvas;
            const videoRequest = vi.fn();
            mountVideo(videoRequest);
            stubFullscreenElement(null);
            setValue(UI_ACTIVE_VIEW, 'radio');
            tick();

            togglePlayerFullscreen();

            expect(shellRequest).toHaveBeenCalledOnce();
            expect(videoRequest).not.toHaveBeenCalled();
            shell.remove();
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
