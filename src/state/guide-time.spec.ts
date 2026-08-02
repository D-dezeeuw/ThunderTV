import { describe, expect, it } from 'vitest';
import {
    computeGuideWindow,
    computeProgramLayout,
    floorToHalfHour,
    formatClockTime,
    formatTimeRange,
    isProgramNow,
    percentInRange,
} from './guide-time';

describe('state/guide-time', () => {
    describe('floorToHalfHour / computeGuideWindow', () => {
        it('floors to the previous half-hour mark', () => {
            const ms = Date.UTC(2026, 0, 1, 20, 47, 12);
            expect(floorToHalfHour(ms)).toBe(Date.UTC(2026, 0, 1, 20, 30, 0));
        });

        it('builds a 5h window reaching an hour behind "now", floored to the half-hour grid', () => {
            const ms = Date.UTC(2026, 0, 1, 20, 47, 12);
            const window = computeGuideWindow(ms);
            // An hour back from 20:47 is 19:47, floored to 19:30.
            expect(window.start).toBe(Date.UTC(2026, 0, 1, 19, 30, 0));
            expect(window.end - window.start).toBe(5 * 60 * 60 * 1000);
            // The contract behind the shape: at least an hour of past on
            // screen, and up to 4h ahead — "now" sits inside the airing
            // blocks, never on the window's left edge.
            expect(ms - window.start).toBeGreaterThanOrEqual(60 * 60 * 1000);
            expect(window.end - ms).toBeLessThanOrEqual(4 * 60 * 60 * 1000);
        });
    });

    describe('percentInRange', () => {
        it('places the midpoint at 50%', () => {
            expect(percentInRange(50, 0, 100)).toBe(50);
        });

        it('clamps below the range to 0', () => {
            expect(percentInRange(-10, 0, 100)).toBe(0);
        });

        it('clamps above the range to 100', () => {
            expect(percentInRange(200, 0, 100)).toBe(100);
        });

        it('returns 0 for a degenerate zero-width range', () => {
            expect(percentInRange(5, 10, 10)).toBe(0);
        });
    });

    describe('computeProgramLayout', () => {
        it('places a program fully inside the window', () => {
            expect(computeProgramLayout(25, 75, 0, 100)).toEqual({ leftPercent: 25, widthPercent: 50 });
        });

        it('clips a program that starts before the window', () => {
            const layout = computeProgramLayout(-50, 50, 0, 100);
            expect(layout.leftPercent).toBe(0);
            expect(layout.widthPercent).toBe(50);
        });

        it('clips a program that ends after the window', () => {
            const layout = computeProgramLayout(50, 150, 0, 100);
            expect(layout.leftPercent).toBe(50);
            expect(layout.widthPercent).toBe(50);
        });

        it('never produces a negative width for a program entirely outside the window', () => {
            const layout = computeProgramLayout(200, 300, 0, 100);
            expect(layout.widthPercent).toBe(0);
        });
    });

    describe('isProgramNow', () => {
        it('is true when now falls within [start, stop)', () => {
            expect(isProgramNow(50, 0, 100)).toBe(true);
        });

        it('is false exactly at stop (half-open interval)', () => {
            expect(isProgramNow(100, 0, 100)).toBe(false);
        });

        it('is false before start', () => {
            expect(isProgramNow(-1, 0, 100)).toBe(false);
        });
    });

    describe('formatClockTime / formatTimeRange (DST correctness via Intl)', () => {
        it('formats a UTC instant in a fixed non-DST zone consistently', () => {
            const ms = Date.UTC(2026, 0, 15, 20, 30, 0);
            // en-GB + UTC-equivalent-ish assertion: just check shape, not the
            // exact local rendering, since the test runner's TZ is unspecified.
            expect(formatClockTime(ms, 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
        });

        it('formats a range as "start–stop"', () => {
            const start = Date.UTC(2026, 0, 15, 20, 0, 0);
            const stop = Date.UTC(2026, 0, 15, 21, 0, 0);
            expect(formatTimeRange(start, stop, 'en-GB')).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
        });

        it('resolves the same wall-clock formatting rule across a DST transition (no manual offset math)', () => {
            // Europe/Amsterdam DST-to-standard transition, 2025-10-26. Both
            // instants are "3 AM local" either side of the fold — Intl (not
            // this module) owns the actual offset, so this only asserts the
            // formatter runs without throwing and returns a clock string for
            // both sides of the transition.
            const before = Date.UTC(2025, 9, 26, 0, 30, 0);
            const after = Date.UTC(2025, 9, 26, 2, 30, 0);
            expect(formatClockTime(before, 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
            expect(formatClockTime(after, 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
        });
    });
});
