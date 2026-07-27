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
let monitored: { video: HTMLVideoElement; onWaiting: () => void } | null = null;

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

/** Starts monitoring `video`; replaces any previous monitor. Safe to call on every channel change. */
export function monitorStreamHealth(video: HTMLVideoElement): void {
    stopStreamHealthMonitor();
    stalls = [];
    reportStreamHealth('good');

    const onWaiting = (): void => {
        stalls.push(Date.now());
        publish();
    };
    video.addEventListener('waiting', onWaiting);
    monitored = { video, onWaiting };
    ticker = setInterval(publish, DECAY_TICK_MS);
}

export function stopStreamHealthMonitor(): void {
    if (ticker !== null) {
        clearInterval(ticker);
        ticker = null;
    }
    if (monitored) {
        monitored.video.removeEventListener('waiting', monitored.onWaiting);
        monitored = null;
    }
    stalls = [];
    reportStreamHealth(null);
}

/** Test-only reset. @internal */
export function resetStreamHealthForTests(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
    monitored = null;
    stalls = [];
}
