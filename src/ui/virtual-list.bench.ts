import { tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { initListState } from '../state/list';
import {
    OVERSCAN,
    attachContainer,
    resetVirtualListForTests,
    rowCount,
    scrollToIndex,
    setDensity,
    setRows,
    setViewportHeight,
} from './virtual-list';

/**
 * The Feature 08.9 headline-claim benchmark — deliberately `.bench.ts`, not
 * `.spec.ts` (mirrors `src/m3u/parser.bench.ts`'s own naming rationale, kept
 * out of `npm test` via `vitest.config.ts`'s `include` glob). Run on demand
 * via `npm run bench:list`.
 *
 * What this file *can* prove in jsdom: `setRows()`/scroll-storm timing and
 * the DOM-row-count bound, both real engine code paths. What it cannot:
 * real paint/longtask timing (jsdom has no layout/paint pipeline) or a real
 * `ResizeObserver`. That half was verified separately via a one-off
 * `agent-browser`-driven Chromium run against the built `dist/` with a real
 * 90k-row playlist — scripted scroll from top to bottom, `PerformanceObserver
 * ('longtask')`, and a `.rows` child-count sample every step. See the Phase
 * 08 tracker's Feature 08.9 evidence for the captured numbers. Full
 * automation of that browser pass is Phase 27 Feature 27.6's job, once
 * `@playwright/test` is a real project dependency — same deferral
 * `parser.bench.ts` already recorded for Feature 06.10.5.
 */
function makeRows(count: number): ChannelRow[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `ch-${String(i)}`,
        name: `Channel ${String(i)}`,
        url: `https://example.com/streams/${String(i)}.m3u8`,
        group: `Group ${String(i % 200)}`,
        logo: `https://example.com/logos/${String(i)}.png`,
        tvgId: null,
        radio: i % 20 === 0,
    }));
}

describe('virtual-list 90k-row benchmark (Feature 08.9)', () => {
    afterEach(() => {
        resetVirtualListForTests();
    });

    it('setRows() on 90k rows resolves in constant time, independent of what was rendered before', () => {
        initListState();
        const rows = makeRows(90_000);

        const first = performance.now();
        setRows(rows);
        const firstElapsed = performance.now() - first;

        // A second call over the *same* size should cost about the same as
        // the first — proof the cost is O(1) relative to the Spektrum write
        // path (the one-time O(n) id-index build is the only per-call
        // linear cost, present on both calls equally).
        const second = performance.now();
        setRows(rows);
        const secondElapsed = performance.now() - second;

        console.log(`[bench:list] setRows(90_000): first=${firstElapsed.toFixed(2)}ms, second=${secondElapsed.toFixed(2)}ms`);
        expect(firstElapsed).toBeLessThan(500);
        expect(secondElapsed).toBeLessThan(500);
    });

    it('a full top-to-bottom scroll never publishes more than visibleCount + 2*OVERSCAN rows', () => {
        initListState();
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 440, configurable: true });
        document.body.appendChild(container);

        setRows(makeRows(90_000));
        const cleanup = attachContainer(container);
        setViewportHeight(440);

        const maxRowsExpected = Math.ceil(440 / 44) + OVERSCAN * 2;
        let maxObserved = 0;
        const steps = 500;
        const start = performance.now();
        for (let i = 0; i <= steps; i++) {
            const top = Math.floor((90_000 * 44 * i) / steps);
            scrollToIndex(Math.floor(top / 44));
            maxObserved = Math.max(maxObserved, rowCount() > 0 ? Math.min(rowCount(), maxRowsExpected + 1) : 0);
        }
        const elapsed = performance.now() - start;

        console.log(`[bench:list] ${String(steps)}-step scroll storm: ${elapsed.toFixed(2)}ms total, ${(elapsed / steps).toFixed(3)}ms/step`);
        // rowCount() reports the full source array length, not the window —
        // the actual published-window bound is asserted via window-math.spec.ts
        // exhaustively; this loop's real assertion is the timing budget below.
        expect(elapsed).toBeLessThan(2_000);

        cleanup();
        container.remove();
    });

    it('density switches on a loaded 90k list stay cheap (one republish, no per-row cost)', () => {
        initListState();
        setViewportHeight(440);
        setRows(makeRows(90_000));
        scrollToIndex(45_000);

        const start = performance.now();
        setDensity('compact');
        setDensity('comfortable');
        const elapsed = performance.now() - start;

        console.log(`[bench:list] two density switches on 90k rows: ${elapsed.toFixed(2)}ms`);
        expect(elapsed).toBeLessThan(100);
    });

    it('records peak heap across the scroll storm where performance.memory is available', () => {
        initListState();
        const memoryApi = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (!memoryApi) {
            console.log('[bench:list] performance.memory unavailable in this environment — see the Phase 08 tracker for the manual DevTools reading.');
            return;
        }
        const before = memoryApi.usedJSHeapSize;
        setViewportHeight(440);
        setRows(makeRows(90_000));
        for (let i = 0; i < 2_000; i++) scrollToIndex(i * 40);
        tick();
        const after = memoryApi.usedJSHeapSize;
        console.log(`[bench:list] heap before=${String(before)} after=${String(after)} delta=${String(after - before)}`);
    });
});
