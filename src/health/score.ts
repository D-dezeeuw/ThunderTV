/**
 * Turning playback evidence into a number — the decaying health model
 * behind stone 3 ("a dead stream is never rendered").
 *
 * Two properties matter more than sophistication here:
 *
 * 1. **Recent evidence outweighs old evidence.** A feed that failed twenty
 *    times last month and worked twice this morning is working. A plain
 *    success ratio says the opposite, which is exactly the wrong answer.
 *    Each observation therefore carries an exponentially-decaying weight
 *    with a one-week half-life — long enough to remember a genuinely dead
 *    stream across a few sessions, short enough that a provider fixing
 *    something is believed within a day or two.
 *
 * 2. **Being wrong has to be cheap.** The score is only ever used to *rank*
 *    and to warn, never to delete a row (see `src/health/README.md`) — so a
 *    stream this model misjudges costs the user one click, not a channel
 *    they can no longer find.
 */

export const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Below this, a feed is treated as "probably dead" — chosen so that it
 * takes more than one bad night to earn: a single fresh failure against no
 * other evidence lands at 0, but one failure against a handful of recent
 * successes stays comfortably above it.
 */
export const LIKELY_DEAD_BELOW = 0.35;

/** Ignore anything past ~4 half-lives; its weight is under 7% and it only adds noise. */
const MAX_AGE_MS = 4 * HALF_LIFE_MS;

export interface HealthRecord {
    key: string;
    /** Decay-weighted successful plays. */
    okWeight: number;
    /** Decay-weighted failures. */
    failWeight: number;
    /** When `okWeight`/`failWeight` were last decayed to — every update rebases both to "now" so they stay directly comparable without re-walking history. */
    updatedAt: number;
    /** Wall-clock ms from attach to first frame, exponentially smoothed. `null` until a play has actually succeeded. */
    ttffMs: number | null;
    /** Last observed outcome, for the "why is this greyed out" readout. */
    lastOutcome: 'ok' | 'failed';
    lastAt: number;
}

export function emptyRecord(key: string, nowMs: number): HealthRecord {
    return { key, okWeight: 0, failWeight: 0, updatedAt: nowMs, ttffMs: null, lastOutcome: 'ok', lastAt: nowMs };
}

/** The multiplier an observation made `ageMs` ago still carries. */
export function decayFactor(ageMs: number): number {
    if (ageMs <= 0) return 1;
    if (ageMs >= MAX_AGE_MS) return 0;
    return Math.pow(0.5, ageMs / HALF_LIFE_MS);
}

/** Rebases both weights onto `nowMs` — the one place decay is applied, so a record read at any later time is always directly usable. */
function decayed(record: HealthRecord, nowMs: number): HealthRecord {
    const factor = decayFactor(nowMs - record.updatedAt);
    return { ...record, okWeight: record.okWeight * factor, failWeight: record.failWeight * factor, updatedAt: nowMs };
}

/** Smoothing weight for a new time-to-first-frame sample — a single unusually slow start shouldn't rewrite the estimate. */
const TTFF_SMOOTHING = 0.3;

export function recordSuccess(record: HealthRecord, nowMs: number, ttffMs: number | null): HealthRecord {
    const base = decayed(record, nowMs);
    const nextTtff =
        ttffMs === null || ttffMs < 0
            ? base.ttffMs
            : base.ttffMs === null
              ? ttffMs
              : base.ttffMs * (1 - TTFF_SMOOTHING) + ttffMs * TTFF_SMOOTHING;
    return { ...base, okWeight: base.okWeight + 1, ttffMs: nextTtff, lastOutcome: 'ok', lastAt: nowMs };
}

export function recordFailure(record: HealthRecord, nowMs: number): HealthRecord {
    const base = decayed(record, nowMs);
    return { ...base, failWeight: base.failWeight + 1, lastOutcome: 'failed', lastAt: nowMs };
}

/**
 * 0–1, where 1 is "always works". A feed with no evidence at all scores
 * `null`, not 0 — "never tried" and "always fails" must not rank the same,
 * or every channel the user has yet to click would be treated as broken.
 */
export function healthScore(record: HealthRecord, nowMs: number): number | null {
    const base = decayed(record, nowMs);
    const total = base.okWeight + base.failWeight;
    if (total <= 0) return null;
    return base.okWeight / total;
}

export function isLikelyDead(record: HealthRecord, nowMs: number): boolean {
    const score = healthScore(record, nowMs);
    return score !== null && score < LIKELY_DEAD_BELOW;
}

/**
 * Ranks two feeds for automatic variant selection, best first. An untried
 * feed sorts *between* known-good and known-bad: worth trying before one
 * that has been failing, not worth preferring over one that just worked.
 */
export function compareForPlayback(a: HealthRecord | null, b: HealthRecord | null, nowMs: number): number {
    const sa = a ? healthScore(a, nowMs) : null;
    const sb = b ? healthScore(b, nowMs) : null;
    const ra = sa ?? LIKELY_DEAD_BELOW;
    const rb = sb ?? LIKELY_DEAD_BELOW;
    if (ra !== rb) return rb - ra;
    // Equal reliability: prefer the one that starts faster. Unknown startup
    // time sorts last, same "don't reward absence of evidence" reasoning.
    const ta = a?.ttffMs ?? Number.POSITIVE_INFINITY;
    const tb = b?.ttffMs ?? Number.POSITIVE_INFINITY;
    return ta - tb;
}
