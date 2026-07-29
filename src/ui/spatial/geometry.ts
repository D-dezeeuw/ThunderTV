/**
 * Where a D-pad press should actually go — Vision 3.0's stone 8, the
 * *geometry* half (this file is pure; `navigator.ts` owns the DOM).
 *
 * The vision asks for "true spatial D-pad navigation as a first-class input
 * model rather than a keyboard emulation". The distinction matters: Tab
 * order is a single ordered ring authored into the markup, and on a 10-foot
 * layout it sends the cursor somewhere that has nothing to do with where
 * the user pointed the remote. Spatial navigation asks a geometric
 * question instead — *which element is actually to the right of this one* —
 * so the answer stays correct however the layout reflows, and needs no
 * per-screen hand-authored focus map.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

/** The subset of `DOMRect` this needs — keeps the module testable without a DOM. */
export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface Candidate<T> {
    ref: T;
    rect: Rect;
}

/**
 * How heavily to punish being off to one side. A candidate directly ahead
 * but far away should usually beat one that is very close but way off
 * axis — otherwise pressing "down" in a column next to a dense grid drifts
 * sideways into the grid. Tuned so a candidate has to be roughly three
 * times nearer to win by being off-axis.
 */
const ORTHOGONAL_WEIGHT = 3;

/** Overlapping edges (a shared border, a 1px rounding difference) must not read as "ahead of" — a candidate has to genuinely lead in the direction pressed. */
const MIN_ADVANCE_PX = 1;

function centerOf(rect: Rect): { x: number; y: number } {
    return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/** Gap between two 1-D ranges; 0 when they overlap at all. */
function rangeGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
    if (aEnd < bStart) return bStart - aEnd;
    if (bEnd < aStart) return aStart - bEnd;
    return 0;
}

/**
 * True when `candidate` lies in `direction` from `origin`. Uses the leading
 * *edge*, not the centre: a tall sidebar next to a short button has a centre
 * far below it, but is still plainly "to the left" — a centre-only test
 * refuses to move into large elements, which is the most common way naive
 * spatial navigation feels broken.
 */
export function isAhead(origin: Rect, candidate: Rect, direction: Direction): boolean {
    switch (direction) {
        case 'up':
            return candidate.top < origin.top - MIN_ADVANCE_PX + 1 && candidate.bottom <= origin.top + MIN_ADVANCE_PX;
        case 'down':
            return candidate.bottom > origin.bottom + MIN_ADVANCE_PX - 1 && candidate.top >= origin.bottom - MIN_ADVANCE_PX;
        case 'left':
            return candidate.left < origin.left - MIN_ADVANCE_PX + 1 && candidate.right <= origin.left + MIN_ADVANCE_PX;
        case 'right':
            return candidate.right > origin.right + MIN_ADVANCE_PX - 1 && candidate.left >= origin.right - MIN_ADVANCE_PX;
    }
}

/**
 * Lower is better. Distance along the pressed axis, plus a weighted penalty
 * for how far off that axis the candidate sits — measured as a *gap between
 * ranges*, so anything overlapping the origin's own span scores zero
 * penalty regardless of how its centre happens to line up.
 */
export function score(origin: Rect, candidate: Rect, direction: Direction): number {
    const originCenter = centerOf(origin);
    const candidateCenter = centerOf(candidate);

    if (direction === 'up' || direction === 'down') {
        const primary = direction === 'up' ? origin.top - candidate.bottom : candidate.top - origin.bottom;
        const orthogonal = rangeGap(origin.left, origin.right, candidate.left, candidate.right);
        // Centre offset breaks ties among equally-overlapping candidates, so
        // a row of buttons under a wide element resolves to the nearest one
        // rather than the first in DOM order.
        const tieBreak = Math.abs(originCenter.x - candidateCenter.x) / 1000;
        return Math.max(0, primary) + orthogonal * ORTHOGONAL_WEIGHT + tieBreak;
    }

    const primary = direction === 'left' ? origin.left - candidate.right : candidate.left - origin.right;
    const orthogonal = rangeGap(origin.top, origin.bottom, candidate.top, candidate.bottom);
    const tieBreak = Math.abs(originCenter.y - candidateCenter.y) / 1000;
    return Math.max(0, primary) + orthogonal * ORTHOGONAL_WEIGHT + tieBreak;
}

/**
 * The best target in `direction`, or `null` when nothing lies that way —
 * a null answer is meaningful and must not be papered over by wrapping
 * around: on a TV, focus silently jumping from the top of the screen to the
 * bottom is far more disorienting than a press that does nothing.
 */
export function findNext<T>(origin: Rect, candidates: readonly Candidate<T>[], direction: Direction): T | null {
    let best: T | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        if (!isAhead(origin, candidate.rect, direction)) continue;
        const value = score(origin, candidate.rect, direction);
        if (value < bestScore) {
            bestScore = value;
            best = candidate.ref;
        }
    }
    return best;
}
