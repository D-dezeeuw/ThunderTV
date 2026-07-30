import type { ChannelRow } from '../m3u/types';
import { publishListWindow } from '../state/list-publish';
import { rowHeight, type Density } from './density';
import { clampScrollTop, computeVisibleCount, computeWindow } from './window-math';

/**
 * The Feature 08.1/08.10 windowing controller — masterplan §5.4/§6.1's
 * contract ("full array in module memory, only the window in Spektrum")
 * lives here. `allRows` below is *this module's own* array — the current
 * view's row set — distinct from `src/m3u/channel-memory.ts`'s full-playlist
 * cache: it can be the whole active source, or a filtered subset (a group,
 * later a search result). `setRows()` is the single choke point every
 * caller — imports, group filters, search, source switches — uses to change
 * what's displayed (Feature 08.10.4); nothing else may write
 * `list.visibleRows`/`padTop`/`padBottom` (enforced by
 * `src/shared/testing/no-raw-each.spec.ts`'s template grep and this
 * module's exclusive ownership of `publishListWindow()` calls).
 */
export const OVERSCAN = 8;

let allRows: ChannelRow[] = [];
let rowIndexById = new Map<string, number>();
let scrollTop = 0;
let rowH = rowHeight('comfortable');
let visibleCount = 0;
let viewportHeight = 0;
let rafHandle: number | null = null;
let containerEl: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

/**
 * Swaps the displayed row set and republishes immediately — Feature 08.1.5's
 * "controller's only data entry point." `options.scrollTop` restores a
 * saved position (Feature 08.2.8/08.6.4/08.6.8); omitted, the view starts at
 * the top (Feature 08.10.6's "no transient render of the old source's rows"
 * — a fresh `setRows` call always fully replaces both the array and the
 * published window in one synchronous step, never two).
 */
export function setRows(rows: readonly ChannelRow[], options: { scrollTop?: number } = {}): void {
    allRows = rows as ChannelRow[];
    rowIndexById = new Map(allRows.map((row, index) => [row.id, index]));
    scrollTop = clampScrollTop(options.scrollTop ?? 0, allRows.length, rowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

export function getAllRows(): readonly ChannelRow[] {
    return allRows;
}

export function rowCount(): number {
    return allRows.length;
}

export function rowAt(index: number): ChannelRow | undefined {
    return allRows[index];
}

/** O(1) id → row lookup (Feature 08.7.2's "id-based, so selection survives scrolling") — the map is rebuilt once per `setRows()`, never per lookup. */
export function findRowById(id: string): ChannelRow | undefined {
    const index = rowIndexById.get(id);
    return index === undefined ? undefined : allRows[index];
}

export function indexOfRow(id: string): number {
    return rowIndexById.get(id) ?? -1;
}

export function getScrollTop(): number {
    return scrollTop;
}

export function getRowHeight(): number {
    return rowH;
}

/** Feature 08.1.7: a density switch is exactly one republish — rescale the preserved scroll position proportionally so roughly the same rows stay in view. */
export function setDensity(density: Density): void {
    const nextRowH = rowHeight(density);
    if (nextRowH === rowH) return;
    const ratio = nextRowH / rowH;
    rowH = nextRowH;
    visibleCount = computeVisibleCount(viewportHeight, rowH);
    scrollTop = clampScrollTop(scrollTop * ratio, allRows.length, rowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

/**
 * Feature 08.1.6: recomputes `visibleCount` from a real viewport height and
 * republishes — called on mount and on every `ResizeObserver` firing.
 * Re-syncs the container's actual DOM `scrollTop` too (not just the
 * published window): a hidden ancestor (`data-if`, e.g. the channel list
 * shell before `playlist.sources` has finished loading) collapses the
 * container to a 0×0, non-rendered box, and browsers silently drop a
 * programmatic `scrollTop` assignment made while an element is in that
 * state — found via real-browser verification restoring a saved position
 * on reload (Feature 08.6.10). The container transitioning back to visible
 * fires this same callback (a real content-rect change), which is exactly
 * the moment the assignment needs to be retried.
 */
export function setViewportHeight(height: number): void {
    viewportHeight = height;
    visibleCount = computeVisibleCount(viewportHeight, rowH);
    scrollTop = clampScrollTop(scrollTop, allRows.length, rowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

/** Feature 08.5.2: jump to an exact row index (group jump, restored position) — lands exactly, since row height is fixed and never measured. */
export function scrollToIndex(index: number): void {
    scrollTop = clampScrollTop(index * rowH, allRows.length, rowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

/** Feature 08.7.4: scrolls just enough to bring `index` into the visible (non-overscan) viewport — a no-op if it's already visible. Selection drives scroll, never the other way around. */
export function ensureIndexVisible(index: number): void {
    if (rowH <= 0 || visibleCount <= 0) return;
    const first = Math.floor(scrollTop / rowH);
    const last = first + visibleCount - 1;
    if (index < first) {
        scrollToIndex(index);
    } else if (index > last) {
        scrollToIndex(Math.max(0, index - visibleCount + 1));
    }
}

/** How many rows of lead-in a revealed row keeps above it, so it lands in the list rather than glued to the top edge. */
const REVEAL_LEAD_ROWS = 2;

/**
 * Puts `index` on screen for a jump that started somewhere else — a Starred
 * or Recent entry replayed from another view, which lands in this list with
 * the scroll reset to the top by `setRows()`.
 *
 * Two things separate it from `ensureIndexVisible()` (keyboard nav): it
 * leaves a couple of rows of context above the target instead of parking it
 * on the viewport edge, and it still scrolls when the viewport hasn't been
 * measured yet. That second case is the normal one here: the target view's
 * list is still hidden (`data-if`, zero height) at the moment the replay
 * publishes its rows, so `visibleCount` is 0 and there is nothing to compare
 * against — `setViewportHeight()` re-clamps and republishes the moment the
 * container appears, which is what makes the position stick.
 */
export function revealIndex(index: number): void {
    if (index < 0) return;
    if (visibleCount > 0 && rowH > 0) {
        const first = Math.floor(scrollTop / rowH);
        if (index >= first && index < first + visibleCount) return;
    }
    scrollToIndex(Math.max(0, index - REVEAL_LEAD_ROWS));
}

function syncContainerScrollTop(): void {
    if (containerEl && containerEl.scrollTop !== scrollTop) containerEl.scrollTop = scrollTop;
}

/** Feature 08.1.4: rAF-throttled — at most one `publishWindow()` per animation frame no matter how many `scroll` events fire in between. */
function onScroll(event: Event): void {
    scrollTop = (event.target as HTMLElement).scrollTop;
    if (rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        publishWindow();
    });
}

function publishWindow(): void {
    const result = computeWindow({ scrollTop, rowH, overscan: OVERSCAN, visibleCount, totalRows: allRows.length });
    publishListWindow(allRows.slice(result.sliceStart, result.sliceEnd), result.padTop, result.padBottom);
}

/**
 * Re-publishes the *same* window without any scroll change — the hook the
 * global `epg.tick` beat uses to refresh each visible row's now/next line
 * and progress bar (masterplan §5.5: one 30s tick re-enriches the visible
 * slice, instead of a timer per row). Deliberately not rAF-throttled: it
 * fires at most twice a minute, and delaying it a frame would buy nothing.
 */
export function republishWindow(): void {
    publishWindow();
}

/**
 * Wires scroll + resize to the real list container (called once the DOM ref
 * exists — `src/ui/list-bindings.ts`, post-`bindDOM()`). Returns a cleanup
 * function. `ResizeObserver` is unavailable in the jsdom test environment
 * (a documented gap, same class as Feature 06.10.5's longtask-observer
 * note) — guarded so specs can still exercise the rest of this path; real
 * browsers always have it, so production resize behavior is unaffected.
 */
export function attachContainer(el: HTMLElement): () => void {
    containerEl = el;
    el.addEventListener('scroll', onScroll);

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) setViewportHeight(entry.contentRect.height);
        });
        resizeObserver.observe(el);
    }
    setViewportHeight(el.clientHeight);

    return () => {
        el.removeEventListener('scroll', onScroll);
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (containerEl === el) containerEl = null;
    };
}

/** Test-only: resets every module-level field between specs. @internal */
export function resetVirtualListForTests(): void {
    allRows = [];
    rowIndexById = new Map();
    scrollTop = 0;
    rowH = rowHeight('comfortable');
    visibleCount = 0;
    viewportHeight = 0;
    if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    containerEl = null;
}
