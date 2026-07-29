/**
 * What is on this channel *right now*, and what follows it — the lookup
 * behind the channel list's per-row EPG line (masterplan §6.7).
 *
 * Pure and synchronous by design: this runs for every row in the visible
 * window on every 30s tick, so it must never touch storage or allocate per
 * call. Programs arrive already sorted by `start` (their `epgPrograms`
 * composite key `[channelId, start]` guarantees that ordering on read), so
 * finding "now" is a binary search rather than a scan — ~40 rows × log₂(a
 * few hundred programs) per tick is microseconds, and it stays that way
 * whether a channel carries 20 programmes or 2000.
 */

export interface ProgramSpan {
    start: number;
    stop: number;
    title: string;
    description?: string | null;
}

export interface NowNext<T extends ProgramSpan> {
    /** The programme airing at `nowMs`, or `undefined` in a gap between programmes (real feeds do have gaps). */
    now: T | undefined;
    /** The next programme starting after `now` — present even when `now` is `undefined` (a gap still has something coming). */
    next: T | undefined;
}

/**
 * Binary-searches for the last programme whose `start <= nowMs`. That
 * candidate is "now" only if it hasn't already ended — a channel whose
 * last stored programme finished an hour ago is in a gap, not still
 * airing it, which is exactly the case a naive "last one that started"
 * search gets wrong.
 */
export function nowNext<T extends ProgramSpan>(programs: readonly T[], nowMs: number): NowNext<T> {
    let lo = 0;
    let hi = programs.length - 1;
    let idx = -1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (programs[mid]!.start <= nowMs) {
            idx = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    const candidate = idx >= 0 ? programs[idx] : undefined;
    const current = candidate && candidate.stop > nowMs ? candidate : undefined;
    return { now: current, next: programs[idx + 1] };
}

/**
 * How far through a programme `nowMs` is, 0–100. Clamped at both ends so a
 * clock skew or a stale tick can never drive a progress bar past its track;
 * a zero/negative-duration programme (malformed feed data that survived
 * ingestion) reports 0 rather than dividing by zero.
 */
export function progressPercent(start: number, stop: number, nowMs: number): number {
    const span = stop - start;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, ((nowMs - start) / span) * 100));
}
