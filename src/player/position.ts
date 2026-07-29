import { getPlatform } from '../core/platform';
import { streamKey } from '../health/stream-key';

/**
 * Where in the programme we are — the piece stone 9 turned out to need
 * first, because "the episode continues at the frame you left" is not
 * possible if nothing ever wrote the frame down.
 *
 * Sits on the `<video>` element beside `stream-health.ts`, and for the same
 * reason: it is the one place every engine (hls.js, mpegts.js, native)
 * converges, so nothing engine-specific has to know about this at all.
 *
 * ## Two things it deliberately does not do
 *
 * **It does not track live.** A live feed's `currentTime` is an offset into
 * whatever the buffer happens to hold, not a position in a programme;
 * storing it would produce a number that means something different every
 * time it is read. Only seekable media with a finite duration is recorded.
 *
 * **It does not remember a finished programme.** On `ended`, and within a
 * few seconds of the end, the position is cleared — resuming someone into
 * the closing credits is worse than starting them over, and "watched it"
 * is the more useful thing to have forgotten.
 */

/** Below this, resuming is not worth the surprise of not starting at the beginning. */
const MIN_POSITION_SEC = 15;
/** Within this of the end, the programme counts as finished. */
const END_MARGIN_SEC = 20;
/** `timeupdate` fires ~4×/second; storage does not need that. */
const WRITE_INTERVAL_MS = 5_000;

const POSITION_PREFIX = 'playback.position.';

function positionKey(feedKey: string): string {
    return `${POSITION_PREFIX}${feedKey}`;
}

interface Monitored {
    video: HTMLVideoElement;
    onTimeUpdate: () => void;
    onEnded: () => void;
}

let monitored: Monitored | null = null;
let currentFeedKey: string | null = null;
let currentSeconds = 0;
let lastWriteAt = 0;

/** The live value, for whoever is building a handoff right now — always fresher than storage, which is throttled. */
export function currentPositionSec(): number {
    return currentSeconds;
}

async function write(feedKey: string, seconds: number): Promise<void> {
    try {
        await getPlatform().storage.set(positionKey(feedKey), { seconds, at: Date.now() });
    } catch {
        // Silent by design, exactly as the health harvest is: a resume point
        // is a convenience, and a device on the memory tier has nowhere to
        // put it. Losing one must never surface as a playback error.
    }
}

async function forget(feedKey: string): Promise<void> {
    try {
        await getPlatform().storage.delete(positionKey(feedKey));
    } catch {
        // Same reasoning as `write`.
    }
}

export async function storedPosition(feedKey: string): Promise<number> {
    try {
        const stored = await getPlatform().storage.get<{ seconds: number }>(positionKey(feedKey));
        return typeof stored?.seconds === 'number' && Number.isFinite(stored.seconds) ? stored.seconds : 0;
    } catch {
        return 0;
    }
}

/** Records a position this device did not observe itself — an arriving handoff (stone 9), so resuming needs no second mechanism beside the stored one. */
export async function rememberPosition(feedKey: string, seconds: number): Promise<void> {
    if (seconds < MIN_POSITION_SEC) {
        await forget(feedKey);
        return;
    }
    await write(feedKey, seconds);
}

/**
 * Resumes `video` at whatever position is stored for `feedKey`, once it
 * knows its own duration.
 *
 * Two races this has to survive, both real: the metadata can land before the
 * storage read resolves (so `readyState` is checked, not just the event),
 * and the user can zap away mid-read (so the seek is abandoned unless this
 * is still the feed being monitored — otherwise a late `loadedmetadata`
 * would seek whatever is playing *now* to a position from the last thing).
 */
export async function resumeOnceReady(video: HTMLVideoElement, feedKey: string): Promise<void> {
    const seconds = await storedPosition(feedKey);
    if (seconds < MIN_POSITION_SEC) return;

    const seek = (): void => {
        if (monitored?.video !== video || currentFeedKey !== feedKey) return;
        if (!isSeekableProgramme(video)) return;
        video.currentTime = Math.min(seconds, Math.max(0, video.duration - END_MARGIN_SEC));
    };

    if (video.readyState >= HAVE_METADATA) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
}

/** `HTMLMediaElement.HAVE_METADATA` — spelled out because the constant is not on the prototype in every test DOM. */
const HAVE_METADATA = 1;

/**
 * The whole position concern for one attach, so `engine.ts` has a single
 * call rather than the three-way live check / monitor / resume dance.
 *
 * Live is excluded here rather than at the call site because *why* is a
 * property of positions, not of the engine: a live `currentTime` is an
 * offset into whatever the buffer holds, not a place in a programme.
 */
export function trackPlaybackPosition(video: HTMLVideoElement, streamUrl: string, live: boolean): void {
    const feedKey = live ? null : streamKey(streamUrl);
    monitorPlaybackPosition(video, feedKey);
    // Resume is one mechanism, not two: an arriving handoff (stone 9) writes
    // its position into the same store this reads, so nothing here needs to
    // know whether the position came from this device or another one.
    if (feedKey) void resumeOnceReady(video, feedKey);
}

/** True when this media has a real timeline to hold a position in. A live stream reports `Infinity` or `NaN`. */
function isSeekableProgramme(video: HTMLVideoElement): boolean {
    return Number.isFinite(video.duration) && video.duration > 0;
}

/**
 * Starts tracking `video`'s position under `feedKey`. Replaces any previous
 * monitor, so it is safe to call on every channel change. A `null` key stops
 * tracking — that is the live case, and the caller does not need to know it.
 */
export function monitorPlaybackPosition(video: HTMLVideoElement, feedKey: string | null): void {
    stopPositionMonitor();
    if (!feedKey) return;

    currentFeedKey = feedKey;
    currentSeconds = 0;
    lastWriteAt = 0;

    const onTimeUpdate = (): void => {
        if (!isSeekableProgramme(video)) return;
        currentSeconds = video.currentTime;

        const now = Date.now();
        if (now - lastWriteAt < WRITE_INTERVAL_MS) return;
        lastWriteAt = now;

        if (currentSeconds < MIN_POSITION_SEC || currentSeconds > video.duration - END_MARGIN_SEC) {
            void forget(feedKey);
            return;
        }
        void write(feedKey, currentSeconds);
    };

    const onEnded = (): void => {
        currentSeconds = 0;
        void forget(feedKey);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    monitored = { video, onTimeUpdate, onEnded };
}

/**
 * Stops tracking, flushing the last position first. Without the flush, the
 * final up-to-five seconds before someone switches away are lost — which is
 * precisely the moment they are most likely to be handing off.
 */
export function stopPositionMonitor(): void {
    if (monitored) {
        const { video, onTimeUpdate, onEnded } = monitored;
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('ended', onEnded);
        if (currentFeedKey && isSeekableProgramme(video) && currentSeconds >= MIN_POSITION_SEC && currentSeconds <= video.duration - END_MARGIN_SEC) {
            void write(currentFeedKey, currentSeconds);
        }
        monitored = null;
    }
    currentFeedKey = null;
    currentSeconds = 0;
    lastWriteAt = 0;
}

/** Test-only reset — the monitor is process-lifetime module state. @internal */
export function resetPositionForTests(): void {
    monitored = null;
    currentFeedKey = null;
    currentSeconds = 0;
    lastWriteAt = 0;
}
