import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_PAUSED } from '../state/player';
import { get } from '../state/typed';
import { attachPlaybackStateSync } from './playback-state-sync';

/**
 * The reported bug: clicking the preview paused it and then it resumed on its
 * own, "like a double trigger". It was exactly that. A `<video controls>` in
 * Chromium toggles play/pause when its *picture* is clicked, not only its
 * control bar, so the app's own click handler ran on top of the browser's
 * toggle and the two cancelled out.
 *
 * The handler is gone. `player.paused` now follows the element's own events,
 * which is also what makes pausing from the native control bar — or a media
 * key, or a remote — show up on the app's Stop/Play button, something the old
 * click-only path never did.
 *
 * jsdom does not implement real playback, so `play()`/`pause()` are stubbed
 * to dispatch the events a real element would. The events are the contract
 * being tested; who emitted them is not.
 */
function fakeVideo(): HTMLVideoElement {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: true, writable: true, configurable: true });
    return video;
}

function emit(video: HTMLVideoElement, type: 'play' | 'pause'): void {
    Object.defineProperty(video, 'paused', { value: type === 'pause', writable: true, configurable: true });
    video.dispatchEvent(new Event(type));
    tick();
}

describe('playback state sync', () => {
    afterEach(() => {
        resetState();
    });

    function paused(): boolean | undefined {
        return get<boolean>(PLAYER_PAUSED);
    }

    it('follows the element into pause', () => {
        const video = fakeVideo();
        const detach = attachPlaybackStateSync(video);

        emit(video, 'pause');
        expect(paused()).toBe(true);

        detach();
    });

    it('follows it back out again', () => {
        const video = fakeVideo();
        const detach = attachPlaybackStateSync(video);

        emit(video, 'pause');
        emit(video, 'play');
        expect(paused()).toBe(false);

        detach();
    });

    /**
     * The regression itself. One click used to produce a pause *and* a resume;
     * whatever pauses the element, the app must end up paused and stay there.
     */
    it('does not bounce back to playing after a single pause', () => {
        const video = fakeVideo();
        const detach = attachPlaybackStateSync(video);

        emit(video, 'pause');
        expect(paused()).toBe(true);
        // No second event follows a single user gesture — nothing here should
        // flip it back.
        tick();
        expect(paused()).toBe(true);

        detach();
    });

    it('stops following once detached', () => {
        const video = fakeVideo();
        const detach = attachPlaybackStateSync(video);
        emit(video, 'pause');
        detach();

        emit(video, 'play');
        expect(paused()).toBe(true);
    });
});
