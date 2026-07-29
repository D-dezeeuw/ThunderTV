import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initState } from '../state';
import { PLAYER_PLAYBACK_ERROR } from '../state/player';
import { get } from '../state/typed';
import { attachAndPlay, detach, resetPlayerEngineForTests } from './engine';
import { isProgressiveFile } from './engine-select';
import { attachMpegts } from './mpegts-engine';

/**
 * The engine tries mpegts -> hls -> native and reports only once the chain
 * is exhausted. The engines it walks past keep emitting for a while after
 * they are torn down (mpegts.js fires its fatal callback during destroy),
 * so a stream that the *third* attempt played fine still ended up with
 * "Playback failed:" on screen over a live picture.
 *
 * jsdom's HTMLMediaElement has no real pipeline, so these specs drive the
 * element's events directly — which is exactly the surface the fix hooks.
 *
 * Both libraries are mocked so "which engine did the chain reach" is an
 * assertion rather than an inference from jsdom happening to lack MSE.
 * `attachMpegts` reports failure, and hls.js reports itself unsupported, so
 * every chain still walks to its end exactly as it does in jsdom today.
 */
vi.mock('./mpegts-engine', () => ({
    attachMpegts: vi.fn().mockResolvedValue({ ok: false, reason: 'mocked' }),
    detachMpegts: vi.fn(),
}));
const hlsSupported = vi.fn().mockReturnValue(false);
vi.mock('hls.js', () => ({ default: { isSupported: () => hlsSupported() as boolean } }));

const attachMpegtsMock = vi.mocked(attachMpegts);

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
    attachMpegtsMock.mockClear();
    hlsSupported.mockClear();
}

afterEach(() => {
    document.body.replaceChildren();
    resetPlayerEngineForTests();
    vi.useRealTimers();
});

describe('playback error reporting', () => {
    it('clears the error as soon as the element actually starts playing', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/live/1.ts');
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

        await attachAndPlay(video, 'http://provider.test/live/1.ts');
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

        await attachAndPlay(video, 'http://provider.test/live/1.ts');
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

        await attachAndPlay(video, 'http://provider.test/live/1.ts');
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
        const first = attachAndPlay(video, 'http://provider.test/live/1.ts');
        const second = attachAndPlay(video, 'http://provider.test/live/2.ts');
        await Promise.all([first, second]);
        tick();

        expect(video.src).toContain('/2.ts');
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });

    it('stops the previous stream before the next one attaches', async () => {
        boot();
        const video = makeVideo();
        await attachAndPlay(video, 'http://provider.test/live/1.ts');

        // Fresh spies, so only the second attach's teardown is counted.
        const pause = vi.fn();
        const load = vi.fn();
        video.pause = pause;
        video.load = load;
        await attachAndPlay(video, 'http://provider.test/live/2.ts');

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

/**
 * A movie is `movie/user/pass/1234.mkv` — a file, not a feed. Handing it to
 * the demuxer engines first is not merely a wasted round trip: mpegts.js
 * pulls a whole stash before its probe can fail, and hls.js reads the
 * *entire* body as text hunting for `#EXTM3U`, so a multi-GB film streamed
 * for as long as its loader would allow and the viewer saw nothing but a
 * spinner. Only the browser's own pipeline plays these, and it is also the
 * only one that fetches them incrementally with `Range`.
 */
describe('engine selection by container', () => {
    it.each(['mp4', 'mkv', 'avi', 'mov', 'm4v', 'webm'])(
        'hands a .%s file straight to the element, reaching neither demuxer',
        async (ext) => {
            boot();
            const video = makeVideo();

            await attachAndPlay(video, `http://provider.test/movie/u/p/1234.${ext}`, { live: false });

            expect(video.src).toContain(`1234.${ext}`);
            expect(attachMpegtsMock).not.toHaveBeenCalled();
            expect(hlsSupported).not.toHaveBeenCalled();
        },
    );

    it('still walks the full chain for a live stream, which has no extension to go on', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/live/u/p/42');

        expect(attachMpegtsMock).toHaveBeenCalled();
        expect(hlsSupported).toHaveBeenCalled();
        expect(video.src).toContain('/live/u/p/42');
    });

    it('tells mpegts.js a live channel is live and a VOD .ts file is not', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/live/u/p/42.ts');
        expect(attachMpegtsMock.mock.calls[0]?.[2]).toMatchObject({ isLive: true });

        attachMpegtsMock.mockClear();
        await attachAndPlay(video, 'http://provider.test/movie/u/p/1234.ts', { live: false });
        expect(attachMpegtsMock.mock.calls[0]?.[2]).toMatchObject({ isLive: false });
    });

    it('treats a proxied URL by its encoded tail, and ignores a session query', () => {
        // `encodeURIComponent` leaves dots and letters intact, so the
        // extension survives the proxy template verbatim.
        const proxied = `https://proxy.test/${encodeURIComponent('http://provider.test/movie/u/p/1234.mkv')}`;
        expect(isProgressiveFile(proxied)).toBe(true);
        expect(isProgressiveFile('http://provider.test/movie/u/p/1234.MP4?token=abc')).toBe(true);
        expect(isProgressiveFile('http://provider.test/live/u/p/42.m3u8')).toBe(false);
        expect(isProgressiveFile('http://provider.test/live/u/p/42.ts')).toBe(false);
        expect(isProgressiveFile('http://provider.test/live/u/p/42')).toBe(false);
    });
});

/**
 * Native is the whole chain for a file, so its silence has to become a
 * report: a `<video>` pointed at a URL that never yields decodable data
 * emits no `error` and no frames, and the browser's own spinner then sits
 * there forever with nothing in the app able to say why.
 */
describe('last-attempt deadline', () => {
    it('reports when nothing playable has arrived', async () => {
        boot();
        vi.useFakeTimers();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/movie/u/p/1234.mp4', { live: false });
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();

        vi.advanceTimersByTime(20_000);
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toContain('no playable data');
    });

    it('stays quiet once the container has parsed', async () => {
        boot();
        vi.useFakeTimers();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/movie/u/p/1234.mp4', { live: false });
        video.dispatchEvent(new Event('loadedmetadata'));

        vi.advanceTimersByTime(60_000);
        tick();
        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toBeNull();
    });

    it('names the container when the element rejects the file outright', async () => {
        boot();
        const video = makeVideo();

        await attachAndPlay(video, 'http://provider.test/movie/u/p/1234.mkv', { live: false });
        Object.defineProperty(video, 'error', {
            configurable: true,
            value: { code: 4, message: '' },
        });
        video.dispatchEvent(new Event('error'));
        tick();

        expect(get<string | null>(PLAYER_PLAYBACK_ERROR)).toContain('container');
    });
});
