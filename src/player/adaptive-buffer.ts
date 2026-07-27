/**
 * Adaptive buffering for the MPEG-TS engine. mpegts.js fixes its input
 * stash size at player-creation time, so "adaptive" means two things:
 *
 *  1. a starting estimate from the Network Information API when the
 *     browser exposes it (Chromium/Electron do; Safari and Firefox do
 *     not), so a known-slow link starts deep instead of learning the hard
 *     way;
 *  2. escalation from what actually happens — every `waiting` event on the
 *     video element is a real stall, and enough of them within a window
 *     rebuild the player one rung deeper on the ladder.
 *
 * Deeper stash = more seconds behind live, but jitter absorbed instead of
 * rebuffering. The ladder tops out rather than growing without bound: past
 * a few MB the problem is bandwidth, not buffering, and no amount of stash
 * fixes a link that cannot carry the bitrate.
 *
 * Pure functions with the browser API read through a narrow accessor, so
 * the decision logic is unit-testable without a network.
 */

/** KB rungs, shallowest first. 384 is mpegts.js's own default; the top rung is deliberately generous for a bad hotel/cafe link. */
export const STASH_LADDER_KB: readonly number[] = [512, 1024, 2048, 4096];

/** Two stalls inside this window mean the current rung is not holding. */
export const STALL_WINDOW_MS = 60_000;
export const STALLS_BEFORE_ESCALATION = 2;
/** Never rebuild the player more often than this, however bad the link — a rebuild is itself an interruption. */
export const MIN_ESCALATION_INTERVAL_MS = 30_000;

interface NetworkInformationLike {
    effectiveType?: string;
    downlink?: number;
    saveData?: boolean;
}

function readConnection(): NetworkInformationLike | undefined {
    return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/**
 * Starting rung. `effectiveType` is the browser's own rolling estimate of
 * the link (it already accounts for latency as well as throughput), with
 * `downlink` breaking the tie inside the very broad `4g` bucket — which
 * covers everything from weak Wi-Fi to gigabit fibre.
 */
export function estimateStashKb(connection: NetworkInformationLike | undefined = readConnection()): number {
    const rungs = STASH_LADDER_KB;
    const shallow = rungs[0] ?? 512;
    const mid = rungs[1] ?? 1024;
    const deep = rungs[2] ?? 2048;
    const deepest = rungs[rungs.length - 1] ?? 4096;

    if (!connection?.effectiveType) return mid; // API unavailable — start where "Smooth" would.
    if (connection.saveData === true) return deepest;

    switch (connection.effectiveType) {
        case 'slow-2g':
        case '2g':
            return deepest;
        case '3g':
            return deep;
        case '4g':
            return (connection.downlink ?? 0) >= 10 ? shallow : mid;
        default:
            return mid;
    }
}

/** The next rung up, or the same value when already at the top (the caller then stops rebuilding). */
export function escalateStashKb(currentKb: number): number {
    const next = STASH_LADDER_KB.find((rung) => rung > currentKb);
    return next ?? (STASH_LADDER_KB[STASH_LADDER_KB.length - 1] ?? currentKb);
}

export function isTopRung(stashKb: number): boolean {
    return stashKb >= (STASH_LADDER_KB[STASH_LADDER_KB.length - 1] ?? stashKb);
}

/**
 * Rolling stall counter. Timestamps are passed in rather than read from
 * the clock so the escalation policy is testable directly.
 */
export class StallTracker {
    private stalls: number[] = [];
    /** `-Infinity`, not 0: the cooldown must never suppress the FIRST escalation — a stream that stalls from the start is exactly the case that needs a deeper buffer soonest. */
    private lastEscalationAt = Number.NEGATIVE_INFINITY;

    /** Records a stall and answers whether the buffer should grow now. */
    shouldEscalate(now: number): boolean {
        this.stalls.push(now);
        this.stalls = this.stalls.filter((at) => now - at <= STALL_WINDOW_MS);
        if (this.stalls.length < STALLS_BEFORE_ESCALATION) return false;
        if (now - this.lastEscalationAt < MIN_ESCALATION_INTERVAL_MS) return false;
        this.lastEscalationAt = now;
        this.stalls = [];
        return true;
    }

    reset(): void {
        this.stalls = [];
        this.lastEscalationAt = Number.NEGATIVE_INFINITY;
    }
}
