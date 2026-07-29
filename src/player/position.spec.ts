import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import {
    currentPositionSec,
    monitorPlaybackPosition,
    rememberPosition,
    resetPositionForTests,
    resumeOnceReady,
    stopPositionMonitor,
    storedPosition,
} from './position';

const FEED = 'panel.example:8080/live/*/*/12345.ts';

afterEach(() => {
    resetPositionForTests();
    vi.useRealTimers();
});

/** A `<video>` stand-in with the three properties the monitor actually reads. */
function fakeVideo(duration: number): HTMLVideoElement {
    const target = new EventTarget();
    return Object.assign(target, {
        duration,
        currentTime: 0,
        readyState: 1,
    }) as unknown as HTMLVideoElement;
}

function tick(video: HTMLVideoElement, seconds: number): void {
    (video as unknown as { currentTime: number }).currentTime = seconds;
    video.dispatchEvent(new Event('timeupdate'));
}

describe('tracking a position', () => {
    it('records where the viewer is', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);

            tick(video, 640);
            await Promise.resolve();

            expect(currentPositionSec()).toBe(640);
            expect(await storedPosition(FEED)).toBe(640);
            void storage;
        });
    });

    it('ignores live, which has no position to record', async () => {
        await withFakePlatform({}, async () => {
            // A live stream reports an infinite duration; even if a key were
            // passed, there is nothing meaningful to store.
            const video = fakeVideo(Number.POSITIVE_INFINITY);
            monitorPlaybackPosition(video, FEED);
            tick(video, 640);
            await Promise.resolve();
            expect(await storedPosition(FEED)).toBe(0);
        });
    });

    it('does nothing at all when there is no feed key — the live path', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, null);
            tick(video, 640);
            await Promise.resolve();
            expect(currentPositionSec()).toBe(0);
        });
    });

    it('forgets a programme watched to the end', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);
            tick(video, 1200);
            await Promise.resolve();
            expect(await storedPosition(FEED)).toBe(1200);

            video.dispatchEvent(new Event('ended'));
            await Promise.resolve();
            // Resuming into the closing credits is worse than starting over.
            expect(await storedPosition(FEED)).toBe(0);
        });
    });

    it('does not record the first few seconds, which are not worth resuming', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);
            tick(video, 4);
            await Promise.resolve();
            expect(await storedPosition(FEED)).toBe(0);
        });
    });

    it('throttles writes but keeps the live value exact', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);

            tick(video, 100);
            await Promise.resolve();
            tick(video, 101);
            await Promise.resolve();

            // Storage still holds the first sample — `timeupdate` fires ~4×/s
            // and storage does not need that — but a handoff built right now
            // gets the exact position.
            expect(await storedPosition(FEED)).toBe(100);
            expect(currentPositionSec()).toBe(101);
        });
    });

    it('flushes on stop, so the last seconds before a handoff are not lost', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);
            tick(video, 100);
            await Promise.resolve();
            tick(video, 148);

            stopPositionMonitor();
            await Promise.resolve();
            expect(await storedPosition(FEED)).toBe(148);
        });
    });
});

describe('resuming', () => {
    it('seeks to the stored position once metadata is there', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 500);
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);

            await resumeOnceReady(video, FEED);
            expect(video.currentTime).toBe(500);
        });
    });

    it('waits for metadata when the element does not have it yet', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 500);
            const video = fakeVideo(3600);
            (video as unknown as { readyState: number }).readyState = 0;
            monitorPlaybackPosition(video, FEED);

            await resumeOnceReady(video, FEED);
            expect(video.currentTime).toBe(0);

            video.dispatchEvent(new Event('loadedmetadata'));
            expect(video.currentTime).toBe(500);
        });
    });

    it('abandons the seek if the viewer zapped away while the read was in flight', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 500);
            const video = fakeVideo(3600);
            (video as unknown as { readyState: number }).readyState = 0;
            monitorPlaybackPosition(video, FEED);
            await resumeOnceReady(video, FEED);

            // Something else is playing now. A late `loadedmetadata` must not
            // seek it to the last thing's position.
            monitorPlaybackPosition(fakeVideo(3600), 'a-different-feed');
            video.dispatchEvent(new Event('loadedmetadata'));
            expect(video.currentTime).toBe(0);
        });
    });

    it('clamps a stale position past the end back inside the media', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 99_999);
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);

            await resumeOnceReady(video, FEED);
            expect(video.currentTime).toBe(3580);
        });
    });

    it('does not seek when there is nothing stored', async () => {
        await withFakePlatform({}, async () => {
            const video = fakeVideo(3600);
            monitorPlaybackPosition(video, FEED);
            await resumeOnceReady(video, FEED);
            expect(video.currentTime).toBe(0);
        });
    });
});

describe('rememberPosition', () => {
    it('accepts a position that arrived with a handoff', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 750);
            expect(await storedPosition(FEED)).toBe(750);
        });
    });

    it('clears rather than storing one too small to be worth resuming', async () => {
        await withFakePlatform({}, async () => {
            await rememberPosition(FEED, 900);
            await rememberPosition(FEED, 2);
            expect(await storedPosition(FEED)).toBe(0);
        });
    });
});
