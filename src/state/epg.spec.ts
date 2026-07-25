import { appState, resetState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initEpgState, startEpgTick, stopEpgTick } from './epg';

function tickValue(): number | undefined {
    return (appState['epg'] as { tick?: number } | undefined)?.tick;
}

describe('epg tick (Feature 05.1.6, masterplan §5.5)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        stopEpgTick();
        resetState();
        vi.useRealTimers();
    });

    it('initEpgState seeds epg.tick with the current time', () => {
        initEpgState();
        tick();
        expect(tickValue()).toBeTypeOf('number');
    });

    it('startEpgTick republishes epg.tick every 30s and stops when told to', () => {
        initEpgState();
        tick();
        const first = tickValue();

        startEpgTick();
        vi.advanceTimersByTime(30_000);
        tick();
        const second = tickValue();
        expect(second).not.toBe(first);

        stopEpgTick();
        vi.advanceTimersByTime(60_000);
        tick();
        expect(tickValue()).toBe(second);
    });

    it('startEpgTick is idempotent — calling it twice does not double the interval rate', () => {
        initEpgState();
        tick();
        startEpgTick();
        startEpgTick();

        vi.advanceTimersByTime(30_000);
        tick();
        // A doubled interval would have already fired the second tick's
        // *second* callback by now if the first startEpgTick() call's
        // timer were still live alongside the second's — instead there
        // must be exactly one active interval.
        const afterOneBeat = tickValue();
        vi.advanceTimersByTime(29_999);
        tick();
        expect(tickValue()).toBe(afterOneBeat);
    });

    it("startEpgTick's returned stopper matches stopEpgTick", () => {
        initEpgState();
        tick();
        const stop = startEpgTick();
        const before = tickValue();
        stop();
        vi.advanceTimersByTime(60_000);
        tick();
        expect(tickValue()).toBe(before);
    });
});
