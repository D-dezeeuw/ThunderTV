import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initState } from '../state';
import { PLAYER_PLAYBACK_ERROR } from '../state/player';
import { get } from '../state/typed';
import { attachAndPlay, detach, resetPlayerEngineForTests } from './engine';

/**
 * The engine tries mpegts -> hls -> native and reports only once the chain
 * is exhausted. The engines it walks past keep emitting for a while after
 * they are torn down (mpegts.js fires its fatal callback during destroy),
 * so a stream that the *third* attempt played fine still ended up with
 * "Playback failed:" on screen over a live picture.
 *
 * jsdom's HTMLMediaElement has no real pipeline, so these specs drive the
 * element's events directly — which is exactly the surface the fix hooks.
 */

function makeVideo(): HTMLVideoElement {
    const video = document.createElement('video');
    // jsdom throws "Not implemented" from the real HTMLMediaElement methods.
    video.play = vi.fn().mockResolvedValue(undefined);
    video.load = vi.fn();
    video.canPlayType = vi.fn().mockReturnValue('');
    document.body.appendChild(video);
    return video;
}

function boot(): void {
    resetState();
    resetPlayerEngineForTests();
    initState();
    tick();
}

afterEach(() => {
    document.body.replaceChildren();
    resetPlayerEngineForTests();
});

describe('playback error reporting', () => {
    it('clears the error as soon as the element actually starts playing', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/1.webm');
        // Whatever the earlier attempts reported, real playback wins.
        video.dispatchEvent(new Event('error'));
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).not.toBeNull();

        video.dispatchEvent(new Event('playing'));
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });

    it('ignores a late failure from an engine the chain already moved past', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/1.webm');
        video.dispatchEvent(new Event('playing'));
        tick();

        // No MediaError on the element: this is a torn-down engine talking,
        // not the stream on screen dying.
        video.dispatchEvent(new Event('error'));
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });

    it('still reports a stream that dies after it started playing', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/1.webm');
        video.dispatchEvent(new Event('playing'));
        tick();

        Object.defineProperty(video, 'error', {
            configurable: true,
            value: { code: 2, message: '' },
        });
        video.dispatchEvent(new Event('error'));
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toContain('network error');
    });

    it('detach() unhooks both listeners so a stale element cannot write state', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/1.webm');
        detach(video);
        tick();

        video.dispatchEvent(new Event('error'));
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });
});
