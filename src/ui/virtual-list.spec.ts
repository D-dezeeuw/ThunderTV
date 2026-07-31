import { appState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { initListState } from '../state/list';
import {
    OVERSCAN,
    attachContainer,
    ensureIndexVisible,
    findRowById,
    getAllRows,
    getScrollTop,
    indexOfRow,
    resetVirtualListForTests,
    rowAt,
    rowCount,
    scrollToIndex,
    setDensity,
    setRows,
    setViewportHeight,
    viewerHasScrolled,
} from './virtual-list';

function makeRows(count: number): ChannelRow[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `ch-${String(i)}`,
        name: `Channel ${String(i)}`,
        url: `https://example.com/${String(i)}.m3u8`,
        group: null,
        logo: null,
        tvgId: null,
        radio: false,
    }));
}

function visibleRows(): unknown[] {
    return (appState['list'] as { visibleRows?: unknown[] } | undefined)?.visibleRows ?? [];
}

describe('virtual-list controller (Feature 08.1)', () => {
    beforeEach(() => {
        resetVirtualListForTests();
        initListState();
        tick();
    });

    afterEach(() => {
        resetVirtualListForTests();
    });

    it('setRows() publishes a slice of the full array, never the full array itself', () => {
        setRows(makeRows(90_000));
        tick();
        expect(rowCount()).toBe(90_000);
        expect(getAllRows().length).toBe(90_000);
        // visibleCount defaults to 0 (no attached container yet) so the
        // published slice is overscan-only — still proves the slice is
        // nowhere near the full 90k array.
        expect(visibleRows().length).toBeLessThanOrEqual(OVERSCAN * 2 + 1);
    });

    it('setRows() with a 90k array resolves fast — no O(n) Spektrum write on the hot path (Feature 08.10.8)', () => {
        const rows = makeRows(90_000);
        const start = performance.now();
        setRows(rows);
        const elapsedMs = performance.now() - start;
        // setRows() itself does one legitimate O(n) pass (building the id
        // index) — the budget below is generous specifically to absorb
        // that, not the Spektrum write. A real per-row Spektrum write
        // (diffing/recording 90k state entries) would be an order of
        // magnitude slower than even this generous budget.
        expect(elapsedMs).toBeLessThan(300);
    });

    it('setRows() defaults to scrollTop 0 for a fresh view', () => {
        setViewportHeight(400);
        setRows(makeRows(100));
        scrollToIndex(50);
        setRows(makeRows(20));
        expect(getScrollTop()).toBe(0);
    });

    it('setRows() honors an explicit restored scrollTop (Feature 08.2.8/08.6.4)', () => {
        setViewportHeight(400);
        setRows(makeRows(1000), { scrollTop: 440 });
        expect(getScrollTop()).toBe(440);
    });

    it('setRows({ preserveScroll }) leaves the viewer where they are when the row set grows', () => {
        setViewportHeight(440);
        setRows(makeRows(5_000));
        scrollToIndex(2_000);
        const before = getScrollTop();

        // Three more chunked pages, exactly as streamChannelsFor() publishes them.
        for (const total of [10_000, 15_000, 20_000]) {
            setRows(makeRows(total), { preserveScroll: true });
            expect(getScrollTop()).toBe(before);
        }
        expect(rowCount()).toBe(20_000);
    });

    it('preserveScroll still clamps — a grown set that is somehow shorter cannot leave the position past the end', () => {
        setViewportHeight(440);
        setRows(makeRows(1_000));
        scrollToIndex(900);
        setRows(makeRows(20), { preserveScroll: true });
        expect(getScrollTop()).toBeLessThanOrEqual(20 * 44);
    });

    it("viewerHasScrolled() tells a real gesture apart from this controller's own scrolling", () => {
        setRows(makeRows(1_000));
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 440, configurable: true });
        Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });
        document.body.appendChild(container);
        const cleanup = attachContainer(container);

        // scrollToIndex() writes the container's scrollTop itself, so the
        // event it triggers reports a position already held here.
        scrollToIndex(100);
        container.dispatchEvent(new Event('scroll'));
        expect(viewerHasScrolled()).toBe(false);

        // A gesture moves the container first — that is what disagrees.
        (container as unknown as { scrollTop: number }).scrollTop = 9_999;
        container.dispatchEvent(new Event('scroll'));
        expect(viewerHasScrolled()).toBe(true);

        // A growth publish must not forget it; replacing the set does.
        setRows(makeRows(2_000), { preserveScroll: true });
        expect(viewerHasScrolled()).toBe(true);
        setRows(makeRows(2_000));
        expect(viewerHasScrolled()).toBe(false);

        cleanup();
        container.remove();
    });

    it('clamps a restored scrollTop against a shrunk list (Feature 08.6.5)', () => {
        setViewportHeight(400);
        setRows(makeRows(10), { scrollTop: 100_000 });
        expect(getScrollTop()).toBeLessThanOrEqual(10 * 44);
    });

    it('rowAt()/indexOfRow()/findRowById() resolve the current row set by index and id', () => {
        setRows(makeRows(5));
        expect(rowAt(2)?.id).toBe('ch-2');
        expect(indexOfRow('ch-3')).toBe(3);
        expect(indexOfRow('missing')).toBe(-1);
        expect(findRowById('ch-4')?.name).toBe('Channel 4');
        expect(findRowById('missing')).toBeUndefined();
    });

    it('scrollToIndex() lands exactly on the target row (fixed row height, no measuring)', () => {
        setViewportHeight(400);
        setRows(makeRows(1000));
        scrollToIndex(200);
        expect(getScrollTop()).toBe(200 * 44);
    });

    it('setDensity() rescales the preserved scroll position proportionally (Feature 08.1.7)', () => {
        setViewportHeight(400);
        setRows(makeRows(1000));
        scrollToIndex(100); // scrollTop = 100 * 44 = 4400
        setDensity('compact'); // rowH 44 -> 32, ratio 32/44
        expect(getScrollTop()).toBeCloseTo(4400 * (32 / 44), 0);
    });

    it('setDensity() is a no-op republish when the density does not actually change row height', () => {
        setViewportHeight(400);
        setRows(makeRows(1000));
        scrollToIndex(100);
        const before = getScrollTop();
        setDensity('comfortable'); // already comfortable — default rowH
        expect(getScrollTop()).toBe(before);
    });

    it('clamps at the edges for an empty list — zero rows, zero pads (Feature 08.1.8)', () => {
        setRows([]);
        tick();
        expect(visibleRows()).toEqual([]);
        expect((appState['list'] as { padTop?: number }).padTop).toBe(0);
        expect((appState['list'] as { padBottom?: number }).padBottom).toBe(0);
    });

    it('attachContainer() reads the real scrollTop on scroll and republishes at most once per animation frame (Feature 08.1.4/08.1.10)', async () => {
        setRows(makeRows(1000));
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
        document.body.appendChild(container);

        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
        const cleanup = attachContainer(container);
        rafSpy.mockClear();

        // A storm of scroll events between frames — the throttle must
        // collapse them into exactly one scheduled rAF callback.
        for (const top of [44, 88, 132, 176, 220]) {
            Object.defineProperty(container, 'scrollTop', { value: top, configurable: true });
            container.dispatchEvent(new Event('scroll'));
        }
        expect(rafSpy).toHaveBeenCalledTimes(1);

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        // The published window reflects only the *last* scrollTop in the
        // storm — proof the intermediate events were coalesced, not queued.
        expect(getScrollTop()).toBe(220);

        cleanup();
        container.remove();
        rafSpy.mockRestore();
    });

    it('ensureIndexVisible() is a no-op when the index is already within the viewport (Feature 08.7.4)', () => {
        setViewportHeight(440); // visibleCount = 10
        setRows(makeRows(1000));
        scrollToIndex(50); // first visible = 50
        ensureIndexVisible(55); // within [50, 59]
        expect(getScrollTop()).toBe(50 * 44);
    });

    it('ensureIndexVisible() scrolls up when the index is above the viewport', () => {
        setViewportHeight(440);
        setRows(makeRows(1000));
        scrollToIndex(50);
        ensureIndexVisible(10);
        expect(getScrollTop()).toBe(10 * 44);
    });

    it('ensureIndexVisible() scrolls down the minimum amount when the index is below the viewport', () => {
        setViewportHeight(440); // visibleCount = 10
        setRows(makeRows(1000));
        scrollToIndex(0);
        ensureIndexVisible(15);
        // last visible was 9; scroll so 15 becomes the new last visible (index - visibleCount + 1 = 6)
        expect(getScrollTop()).toBe(6 * 44);
    });

    it('attachContainer() sets the initial viewport height from clientHeight and publishes a first window', () => {
        setRows(makeRows(1000));
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 440, configurable: true });
        document.body.appendChild(container);

        const cleanup = attachContainer(container);
        tick();
        // visibleCount = ceil(440/44) = 10; slice = overscan(8) + 10 + overscan(8) capped by list length
        expect(visibleRows().length).toBeLessThanOrEqual(10 + OVERSCAN * 2);
        expect(visibleRows().length).toBeGreaterThan(0);

        cleanup();
        container.remove();
    });
});
