import { describe, expect, it } from 'vitest';
import { clampScrollTop, computeVisibleCount, computeWindow, resolveScrollTarget } from './window-math';

describe('computeWindow() (Feature 08.1.9)', () => {
    it('computes the standard mid-list window with overscan on both sides', () => {
        const result = computeWindow({ scrollTop: 440, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 1000 });
        // first = floor(440/44) = 10
        expect(result.sliceStart).toBe(2); // 10 - 8
        expect(result.sliceEnd).toBe(28); // 10 + 10 + 8
        expect(result.padTop).toBe(2 * 44);
        expect(result.padBottom).toBe((1000 - 28) * 44);
    });

    it('clamps sliceStart at 0 near the top (Feature 08.1.8)', () => {
        const result = computeWindow({ scrollTop: 0, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 1000 });
        expect(result.sliceStart).toBe(0);
        expect(result.padTop).toBe(0);
    });

    it('clamps sliceEnd at totalRows near the bottom (Feature 08.1.8)', () => {
        const result = computeWindow({ scrollTop: 43_800, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 1000 });
        expect(result.sliceEnd).toBe(1000);
        expect(result.padBottom).toBe(0);
    });

    it('returns an empty, zero-pad window for an empty list (Feature 08.1.8)', () => {
        const result = computeWindow({ scrollTop: 0, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 0 });
        expect(result).toEqual({ sliceStart: 0, sliceEnd: 0, padTop: 0, padBottom: 0 });
    });

    it('never returns a negative pad for a scrollTop far past the end (shrunk list)', () => {
        const result = computeWindow({ scrollTop: 1_000_000, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 50 });
        expect(result.sliceEnd).toBe(50);
        expect(result.padBottom).toBe(0);
        expect(result.padTop).toBeGreaterThanOrEqual(0);
    });

    it('handles a list shorter than the viewport — the whole list is the slice, no pads', () => {
        const result = computeWindow({ scrollTop: 0, rowH: 44, overscan: 8, visibleCount: 40, totalRows: 5 });
        expect(result.sliceStart).toBe(0);
        expect(result.sliceEnd).toBe(5);
        expect(result.padTop).toBe(0);
        expect(result.padBottom).toBe(0);
    });

    it('handles a negative scrollTop by treating it as 0', () => {
        const result = computeWindow({ scrollTop: -100, rowH: 44, overscan: 8, visibleCount: 10, totalRows: 1000 });
        expect(result.sliceStart).toBe(0);
        expect(result.padTop).toBe(0);
    });

    it('never returns a negative visibleCount effect — 0 visibleCount still yields overscan-only rows', () => {
        const result = computeWindow({ scrollTop: 440, rowH: 44, overscan: 8, visibleCount: 0, totalRows: 1000 });
        expect(result.sliceStart).toBe(2);
        expect(result.sliceEnd).toBe(18); // 10 + 0 + 8
    });

    it('degenerates cleanly for a zero row height (guards divide-by-zero)', () => {
        const result = computeWindow({ scrollTop: 100, rowH: 0, overscan: 8, visibleCount: 10, totalRows: 1000 });
        expect(result).toEqual({ sliceStart: 0, sliceEnd: 0, padTop: 0, padBottom: 0 });
    });

    it('90k-row scale: window stays a small slice regardless of list size', () => {
        const result = computeWindow({ scrollTop: 2_000_000, rowH: 44, overscan: 8, visibleCount: 30, totalRows: 90_000 });
        expect(result.sliceEnd - result.sliceStart).toBeLessThanOrEqual(30 + 2 * 8);
        expect(result.padTop + result.padBottom + (result.sliceEnd - result.sliceStart) * 44).toBe(90_000 * 44);
    });
});

describe('computeVisibleCount() (Feature 08.1.6)', () => {
    it('rounds up so a partially visible last row still counts', () => {
        expect(computeVisibleCount(450, 44)).toBe(Math.ceil(450 / 44));
    });

    it('is at least 1 even for a zero-height container', () => {
        expect(computeVisibleCount(0, 44)).toBe(1);
    });

    it('is 0 for a non-positive row height (degenerate guard)', () => {
        expect(computeVisibleCount(500, 0)).toBe(0);
    });
});

describe('clampScrollTop() (Feature 08.1.8/08.6.5)', () => {
    it('passes through an in-range value unchanged', () => {
        expect(clampScrollTop(500, 1000, 44, 400)).toBe(500);
    });

    it('clamps a negative value to 0', () => {
        expect(clampScrollTop(-50, 1000, 44, 400)).toBe(0);
    });

    it('clamps a too-large value to the real max scrollable extent', () => {
        const totalHeight = 1000 * 44;
        expect(clampScrollTop(999_999, 1000, 44, 400)).toBe(totalHeight - 400);
    });

    it('clamps to 0 when the full list already fits in the viewport', () => {
        expect(clampScrollTop(200, 5, 44, 1000)).toBe(0);
    });

    it('clamps a stale saved position against a list that shrank (Feature 08.6.5)', () => {
        // saved at 900 rows deep, playlist re-imported down to 50 rows
        const clamped = clampScrollTop(900 * 44, 50, 44, 400);
        expect(clamped).toBe(Math.max(0, 50 * 44 - 400));
    });
});

describe('computeWindow() in the grid layout (columns > 1)', () => {
    it('publishes whole lines and a pad measured in lines, not rows', () => {
        // 100 tiles, 5 across = 20 lines of 300px. Scrolled to line 10, with
        // 3 lines visible and no overscan.
        const result = computeWindow({
            scrollTop: 10 * 300,
            rowH: 300,
            overscan: 0,
            visibleCount: 3,
            totalRows: 100,
            columns: 5,
        });
        expect(result.sliceStart).toBe(50);
        expect(result.sliceEnd).toBe(65);
        expect(result.padTop).toBe(10 * 300);
        expect(result.padBottom).toBe(7 * 300);
    });

    it('covers a partial last line rather than dropping its tiles', () => {
        // 7 tiles at 3 across is 3 lines, the last one only two thirds full.
        const result = computeWindow({ scrollTop: 0, rowH: 200, overscan: 0, visibleCount: 9, totalRows: 7, columns: 3 });
        expect(result.sliceStart).toBe(0);
        expect(result.sliceEnd).toBe(7);
        expect(result.padBottom).toBe(0);
    });

    it('matches the list layout exactly at one column', () => {
        const input = { scrollTop: 1234, rowH: 44, overscan: 8, visibleCount: 12, totalRows: 900 };
        expect(computeWindow({ ...input, columns: 1 })).toEqual(computeWindow(input));
    });
});

describe('clampScrollTop() in the grid layout', () => {
    it('shortens the extent proportionally — the same rows fill fewer lines', () => {
        // 100 tiles, 4 across, 300px lines = 25 lines against a 900px viewport.
        expect(clampScrollTop(999_999, 100, 300, 900, 4)).toBe(25 * 300 - 900);
    });

    it('rounds a partial last line up, so its tiles stay reachable', () => {
        expect(clampScrollTop(999_999, 10, 300, 0, 4)).toBe(3 * 300);
    });
});

/**
 * "When new channels load in, the list scrolls on its own and fights me."
 * Appending rows must leave the viewer exactly where they are — including
 * where they have got to *since* the last scroll event this module saw,
 * which is what the container's live position carries and the controller's
 * own last-known value does not.
 */
describe('resolveScrollTarget()', () => {
    it('leaves the DOM alone on growth, adopting where the container really is', () => {
        expect(resolveScrollTarget({ current: 1200, live: 1560, growth: true })).toEqual({
            scrollTop: 1560,
            writeToDom: false,
        });
    });

    it('falls back to the controller position when there is no measurable container', () => {
        expect(resolveScrollTarget({ current: 1200, live: null, growth: true })).toEqual({
            scrollTop: 1200,
            writeToDom: false,
        });
    });

    it('sends a replacement to the top, and says so', () => {
        expect(resolveScrollTarget({ current: 1200, live: 1560, growth: false })).toEqual({
            scrollTop: 0,
            writeToDom: true,
        });
    });

    it('honours an explicitly requested position — including 0', () => {
        expect(resolveScrollTarget({ current: 5, live: 5, requested: 900, growth: false })).toEqual({
            scrollTop: 900,
            writeToDom: true,
        });
        expect(resolveScrollTarget({ current: 5, live: 5, requested: 0, growth: true })).toEqual({
            scrollTop: 0,
            writeToDom: true,
        });
    });
});
