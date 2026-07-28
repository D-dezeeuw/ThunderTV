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
    video.pause = vi.fn();
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

/**
 * Attaching is asynchronous (two dynamic imports plus `video.play()`),
 * so pressing a second channel while the first is still attaching used to
 * leave both attempts running against one `<video>` element and one set of
 * module globals: the superseded attempt tore down the player that had
 * replaced it, attached its own, and advanced the *new* stream's engine
 * chain past its end — "stream 1 kept playing, stream 2 failed."
 */
describe('switching streams mid-attach', () => {
    it('lets the newest stream win and reports no failure for it', async () => {
        boot();
        const video = makeVideo();

        // Deliberately not awaited: the first attach is still inside its
        // `import('mpegts.js')` when the second one starts.
        const first = attachAndPlay(video, 'http://provider.test/1.webm');
        const second = attachAndPlay(video, 'http://provider.test/2.webm');
        await Promise.all([first, second]);
        tick();

        expect(video.src).toContain('/2.webm');
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });

    it('stops the previous stream before the next one attaches', async () => {
        boot();
        const video = makeVideo();
        await attachAndPlay(video, 'http://provider.test/1.webm');

        // Fresh spies, so only the second attach's teardown is counted.
        const pause = vi.fn();
        const load = vi.fn();
        video.pause = pause;
        video.load = load;
        await attachAndPlay(video, 'http://provider.test/2.webm');

        expect(pause).toHaveBeenCalled();
        expect(load).toHaveBeenCalled();
    });

    it('detach() releases the MediaSource the engine left on the element', () => {
        boot();
        const video = makeVideo();
        const pause = vi.fn();
        video.pause = pause;
        // hls.js hands the element its MediaSource this way; leaving it set
        // keeps a decoder (and its GPU surfaces) alive for a dead stream.
        Object.defineProperty(video, 'srcObject', { configurable: true, writable: true, value: {} });

        detach(video);

        expect(video.srcObject).toBeNull();
        expect(pause).toHaveBeenCalled();
    });
});
