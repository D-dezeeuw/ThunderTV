import { describe, expect, it } from 'vitest';
import { nowNext, progressPercent, type ProgramSpan } from './now-next';

const HOUR = 60 * 60 * 1000;

/** Contiguous hourly programmes starting at `base` — the shape a real feed has most of the time. */
function schedule(base: number, count: number): ProgramSpan[] {
    return Array.from({ length: count }, (_, i) => ({
        start: base + i * HOUR,
        stop: base + (i + 1) * HOUR,
        title: `Program ${String(i)}`,
    }));
}

describe('nowNext', () => {
    it('finds the airing programme and the one after it', () => {
        const programs = schedule(0, 5);
        const found = nowNext(programs, 2 * HOUR + 30 * 60 * 1000);
        expect(found.now?.title).toBe('Program 2');
        expect(found.next?.title).toBe('Program 3');
    });

    it('treats a programme boundary as belonging to the starting programme, not the ending one', () => {
        const programs = schedule(0, 3);
        const found = nowNext(programs, HOUR); // exactly Program 1's start / Program 0's stop
        expect(found.now?.title).toBe('Program 1');
    });

    it('reports no current programme in a gap, but still reports what is next', () => {
        const programs: ProgramSpan[] = [
            { start: 0, stop: HOUR, title: 'Before the gap' },
            { start: 3 * HOUR, stop: 4 * HOUR, title: 'After the gap' },
        ];
        const found = nowNext(programs, 2 * HOUR);
        expect(found.now).toBeUndefined();
        expect(found.next?.title).toBe('After the gap');
    });

    it('reports nothing current when every stored programme has already ended', () => {
        const programs = schedule(0, 3);
        const found = nowNext(programs, 10 * HOUR);
        expect(found.now).toBeUndefined();
        expect(found.next).toBeUndefined();
    });

    it('reports only "next" when the first programme has not started yet', () => {
        const programs = schedule(5 * HOUR, 3);
        const found = nowNext(programs, 0);
        expect(found.now).toBeUndefined();
        expect(found.next?.title).toBe('Program 0');
    });

    it('handles an empty schedule without throwing', () => {
        expect(nowNext([], Date.now())).toEqual({ now: undefined, next: undefined });
    });

    it('handles a single-programme schedule at every position', () => {
        const one: ProgramSpan[] = [{ start: HOUR, stop: 2 * HOUR, title: 'Only' }];
        expect(nowNext(one, 0).next?.title).toBe('Only');
        expect(nowNext(one, HOUR + 1).now?.title).toBe('Only');
        expect(nowNext(one, 3 * HOUR).now).toBeUndefined();
    });

    it('agrees with a linear scan across a long schedule (binary-search correctness)', () => {
        const programs = schedule(0, 200);
        for (let probe = 0; probe < 200 * HOUR; probe += HOUR / 3) {
            const viaSearch = nowNext(programs, probe);
            const viaScan = programs.find((p) => p.start <= probe && p.stop > probe);
            expect(viaSearch.now?.title).toBe(viaScan?.title);
        }
    });
});

describe('progressPercent', () => {
    it('reports 0 at the start, 50 at the midpoint and 100 at the end', () => {
        expect(progressPercent(0, HOUR, 0)).toBe(0);
        expect(progressPercent(0, HOUR, HOUR / 2)).toBe(50);
        expect(progressPercent(0, HOUR, HOUR)).toBe(100);
    });

    it('clamps outside the programme rather than reporting a value off the track', () => {
        expect(progressPercent(HOUR, 2 * HOUR, 0)).toBe(0);
        expect(progressPercent(0, HOUR, 5 * HOUR)).toBe(100);
    });

    it('reports 0 for a zero- or negative-duration programme instead of dividing by zero', () => {
        expect(progressPercent(HOUR, HOUR, HOUR)).toBe(0);
        expect(progressPercent(2 * HOUR, HOUR, 2 * HOUR)).toBe(0);
    });
});
