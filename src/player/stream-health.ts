import { observe } from '../health/store';
import { reportStreamHealth } from '../state/player.actions';
import { STALL_WINDOW_MS } from './adaptive-buffer';

/**
 * Live stream-quality readout for the player bar. Engine-agnostic: it
 * watches the `<video>` element itself, so MPEG-TS, HLS and native all
 * report the same way.
 *
 * A `waiting` event is the element saying it ran dry — the one honest,
 * universal stall signal. Health is the count of those inside a rolling
 * window, so it recovers on its own once the link settles: the decay tick
 * re-evaluates the window even when nothing new happens (no events fire
 * while playback is healthy, which is exactly when the indicator should be
 * going back to green).
 */
export type StreamHealth = 'good' | 'fair' | 'poor';

const DECAY_TICK_MS = 10_000;

let stalls: number[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let monitored: { video: HTMLVideoElement; onWaiting: () => void; onPlaying: () => void } | null = null;

/**
 * The passive-health harvest (stone 3). The monitor already sits on the
 * `<video>` element for every engine, so it is the one place that sees
 * "this feed actually produced a picture" without any engine-specific
 * plumbing — and it already knows when the attach began.
 *
 * Only the *first* `playing` of an attach is recorded: later ones are
 * recoveries from a stall, which the rolling stall window above already
 * accounts for, and counting them would let one flaky-but-watchable stream
 * outrank a rock-solid one purely by stalling more.
 */
let attachStartedAt = 0;
let attachUrl: string | null = null;
let recordedThisAttach = false;

export function healthFor(stallCount: number): StreamHealth {
    if (stallCount === 0) return 'good';
    if (stallCount === 1) return 'fair';
    return 'poor';
}

function recentStallCount(now: number): number {
    stalls = stalls.filter((at) => now - at <= STALL_WINDOW_MS);
    return stalls.length;
}

function publish(): void {
    reportStreamHealth(healthFor(recentStallCount(Date.now())));
}

/**
 * Starts monitoring `video`; replaces any previous monitor. Safe to call on
 * every channel change. `url` is what the health harvest attributes the
 * outcome to — omitted by callers that have no URL to credit (tests, and
 * any future engine that attaches without one).
 */
export function monitorStreamHealth(video: HTMLVideoElement, url: string | null = null): void {
    stopStreamHealthMonitor();
    stalls = [];
    reportStreamHealth('good');

    attachStartedAt = Date.now();
    attachUrl = url;
    recordedThisAttach = false;

    const onWaiting = (): void => {
        stalls.push(Date.now());
        publish();
    };
    const onPlaying = (): void => {
        if (recordedThisAttach) return;
        recordedThisAttach = true;
        observe(attachUrl, 'ok', Date.now() - attachStartedAt);
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    monitored = { video, onWaiting, onPlaying };
    ticker = setInterval(publish, DECAY_TICK_MS);
}

/**
 * Records that the stream being monitored failed. Called by
 * `state/player.actions.ts`'s `reportPlaybackError()` — the one funnel every
 * engine's fatal path already goes through, so no engine needs its own
 * harvest wiring. Ignored once this attach already produced a picture: a
 * stream that played for twenty minutes and then dropped is not the same
 * evidence as one that never started, and counting it as a plain failure
 * would punish long viewing sessions.
 */
export function reportAttachFailed(): void {
    if (recordedThisAttach) return;
    recordedThisAttach = true;
    observe(attachUrl, 'failed');
}

export function stopStreamHealthMonitor(): void {
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
    if (monitored) {
        monitored.video.removeEventListener('waiting', monitored.onWaiting);
        monitored.video.removeEventListener('playing', monitored.onPlaying);
        monitored = null;
    }
    stalls = [];
    attachUrl = null;
    reportStreamHealth(null);
}

/** Test-only reset. @internal */
export function resetStreamHealthForTests(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
    monitored = null;
    stalls = [];
    attachUrl = null;
    recordedThisAttach = false;
}
