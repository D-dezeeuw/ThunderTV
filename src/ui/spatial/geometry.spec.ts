import { describe, expect, it } from 'vitest';
import { findNext, isAhead, score, type Candidate, type Rect } from './geometry';

/** `rect(x, y, w, h)` — top-left origin, like a real `DOMRect`. */
function rect(x: number, y: number, w = 100, h = 40): Rect {
    return { left: x, top: y, right: x + w, bottom: y + h };
}

function named(entries: Record<string, Rect>): Candidate<string>[] {
    return Object.entries(entries).map(([ref, r]) => ({ ref, rect: r }));
}

describe('isAhead', () => {
    const origin = rect(100, 100);

    it('accepts a candidate genuinely in the pressed direction', () => {
        expect(isAhead(origin, rect(100, 200), 'down')).toBe(true);
        expect(isAhead(origin, rect(100, 0), 'up')).toBe(true);
        expect(isAhead(origin, rect(0, 100), 'left')).toBe(true);
        expect(isAhead(origin, rect(300, 100), 'right')).toBe(true);
    });

    it('rejects the opposite direction and the origin itself', () => {
        expect(isAhead(origin, rect(100, 0), 'down')).toBe(false);
        expect(isAhead(origin, origin, 'down')).toBe(false);
    });

    it('treats a tall neighbour as "left", even though its centre is far below', () => {
        // The classic failure of centre-only tests: a full-height sidebar
        // beside a short button refuses to accept focus.
        const sidebar = rect(0, 0, 56, 800);
        expect(isAhead(origin, sidebar, 'left')).toBe(true);
    });

    it('does not treat a merely-overlapping element as ahead', () => {
        expect(isAhead(origin, rect(100, 120), 'down')).toBe(false);
    });
});

describe('score', () => {
    const origin = rect(100, 100);

    it('prefers nearer candidates along the pressed axis', () => {
        expect(score(origin, rect(100, 200), 'down')).toBeLessThan(score(origin, rect(100, 400), 'down'));
    });

    it('penalises being off-axis, so focus does not drift sideways', () => {
        const straightAhead = score(origin, rect(100, 300), 'down');
        const closerButOffAxis = score(origin, rect(600, 200), 'down');
        expect(straightAhead).toBeLessThan(closerButOffAxis);
    });

    it('charges no penalty for any candidate overlapping the origin\'s own span', () => {
        // Both overlap horizontally, so only the vertical distance separates them.
        const a = score(origin, rect(60, 200), 'down');
        const b = score(origin, rect(140, 200), 'down');
        expect(Math.abs(a - b)).toBeLessThan(0.01);
    });
});

describe('findNext', () => {
    it('walks a vertical list one step at a time', () => {
        const rows = named({ r0: rect(0, 0), r1: rect(0, 50), r2: rect(0, 100) });
        expect(findNext(rect(0, 0), rows, 'down')).toBe('r1');
        expect(findNext(rect(0, 50), rows, 'down')).toBe('r2');
        expect(findNext(rect(0, 100), rows, 'up')).toBe('r1');
    });

    it('returns null at an edge instead of wrapping around', () => {
        const rows = named({ r0: rect(0, 0), r1: rect(0, 50) });
        expect(findNext(rect(0, 0), rows, 'up')).toBeNull();
        expect(findNext(rect(0, 50), rows, 'down')).toBeNull();
    });

    it('crosses from a rail into the list beside it, and back', () => {
        // A 56px icon rail on the left, a channel list to its right.
        const rail = rect(0, 200, 56, 56);
        const row = rect(80, 200, 400, 44);
        const all = named({ rail, row });

        expect(findNext(rail, all, 'right')).toBe('row');
        expect(findNext(row, all, 'left')).toBe('rail');
    });

    it('picks the vertically-nearest target when moving sideways into a column', () => {
        const origin = rect(0, 300, 56, 56);
        const column = named({ top: rect(80, 0), middle: rect(80, 290), bottom: rect(80, 700) });
        expect(findNext(origin, column, 'right')).toBe('middle');
    });

    it('ignores candidates that lie the other way', () => {
        const all = named({ above: rect(0, 0), below: rect(0, 200) });
        expect(findNext(rect(0, 100), all, 'down')).toBe('below');
        expect(findNext(rect(0, 100), all, 'up')).toBe('above');
    });

    it('handles an empty candidate set', () => {
        expect(findNext(rect(0, 0), [], 'down')).toBeNull();
    });

    it('moves through a grid row by row and column by column', () => {
        const grid = named({
            a: rect(0, 0, 100, 100),
            b: rect(120, 0, 100, 100),
            c: rect(0, 120, 100, 100),
            d: rect(120, 120, 100, 100),
        });
        expect(findNext(rect(0, 0, 100, 100), grid, 'right')).toBe('b');
        expect(findNext(rect(0, 0, 100, 100), grid, 'down')).toBe('c');
        expect(findNext(rect(120, 0, 100, 100), grid, 'down')).toBe('d');
        expect(findNext(rect(120, 120, 100, 100), grid, 'left')).toBe('c');
    });
});
