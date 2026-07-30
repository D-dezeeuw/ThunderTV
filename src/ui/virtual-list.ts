import type { ChannelRow } from '../m3u/types';
import { publishListWindow } from '../state/list-publish';
import { rowHeight, type Density } from './density';
import { gridColumns, gridTileHeight, type TileShape } from './grid-metrics';
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
let densityRowH = rowHeight('comfortable');
let visibleCount = 0;
let viewportHeight = 0;
let rafHandle: number | null = null;
let containerEl: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

/**
 * The poster-grid layout, or `null` for the list layout. `shape` is what the
 * app asked for; `columns`/`tileH` are what that resolves to at the current
 * container width, recomputed on every resize. Everything below counts in
 * *lines* — one row in the list layout, `columns` tiles in the grid — so the
 * two layouts share one set of scroll math rather than forking it.
 */
let grid: { shape: TileShape; columns: number; tileH: number } | null = null;

function currentRowH(): number {
    return grid ? grid.tileH : densityRowH;
}

function currentColumns(): number {
    return grid ? grid.columns : 1;
}

/** Tiles across in the current layout — 1 while the list layout is active. `state/list.actions.ts` reads it to step the selection cursor a whole line at a time. */
export function columnCount(): number {
    return currentColumns();
}

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
    scrollTop = clampScrollTop(options.scrollTop ?? 0, allRows.length, currentRowH(), viewportHeight, currentColumns());
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
    return currentRowH();
}

/** Feature 08.1.7: a density switch is exactly one republish — rescale the preserved scroll position proportionally so roughly the same rows stay in view. A no-op for geometry while the grid is on (a tile is sized by the container, not by density), but the new value is still recorded so switching back to the list layout uses it. */
export function setDensity(density: Density): void {
    const nextRowH = rowHeight(density);
    if (nextRowH === densityRowH) return;
    const ratio = nextRowH / densityRowH;
    densityRowH = nextRowH;
    if (grid) return;
    visibleCount = computeVisibleCount(viewportHeight, densityRowH);
    scrollTop = clampScrollTop(scrollTop * ratio, allRows.length, densityRowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

/**
 * Switches between the list layout (`null`) and the poster grid. The tile
 * geometry is resolved from the container's real width here and pushed back
 * out as `--grid-cols`/`--grid-tile-h`, so the stylesheet lays out exactly
 * the grid this module's scroll math assumes — a column of disagreement
 * between the two shows up as rows you can scroll past but never see.
 *
 * Idempotent per shape, but always re-measures: `attachContainer()`'s
 * `ResizeObserver` routes width changes back through here too.
 */
export function setGridMode(shape: TileShape | null): void {
    if (grid?.shape === shape && shape !== null) {
        applyLayoutMetrics();
        return;
    }
    if (shape === null && grid === null) return;
    applyLayoutMetrics(shape);
}

function applyLayoutMetrics(nextShape: TileShape | null = grid?.shape ?? null): void {
    const previousRowH = currentRowH();
    const previousColumns = currentColumns();
    // The item sitting at the top of the viewport, so a layout switch keeps
    // the user roughly where they were instead of jumping to the top.
    const anchorIndex = previousRowH > 0 ? Math.floor(scrollTop / previousRowH) * previousColumns : 0;

    if (nextShape === null) {
        grid = null;
    } else {
        const width = containerEl?.clientWidth ?? 0;
        const columns = gridColumns(width);
        grid = { shape: nextShape, columns, tileH: gridTileHeight(width, columns, nextShape) };
    }

    const rowH = currentRowH();
    const columns = currentColumns();
    if (rowH !== previousRowH || columns !== previousColumns) {
        scrollTop = Math.floor(anchorIndex / columns) * rowH;
    }
    visibleCount = computeVisibleCount(viewportHeight, rowH);
    scrollTop = clampScrollTop(scrollTop, allRows.length, rowH, viewportHeight, columns);
    writeGridCustomProperties();
    syncContainerScrollTop();
    publishWindow();
}

function writeGridCustomProperties(): void {
    if (!containerEl) return;
    if (grid) {
        containerEl.style.setProperty('--grid-cols', String(grid.columns));
        containerEl.style.setProperty('--grid-tile-h', `${grid.tileH}px`);
        containerEl.dataset['tileShape'] = grid.shape;
    } else {
        containerEl.style.removeProperty('--grid-cols');
        containerEl.style.removeProperty('--grid-tile-h');
        delete containerEl.dataset['tileShape'];
    }
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
    // A resize can change the container's *width* too, which is what decides
    // the grid's column count — so the grid re-derives its geometry here
    // rather than keeping the columns it was created with.
    if (grid) {
        applyLayoutMetrics();
        return;
    }
    visibleCount = computeVisibleCount(viewportHeight, densityRowH);
    scrollTop = clampScrollTop(scrollTop, allRows.length, densityRowH, viewportHeight);
    syncContainerScrollTop();
    publishWindow();
}

/** Feature 08.5.2: jump to an exact row index (group jump, restored position) — lands exactly, since line height is fixed and never measured. In the grid layout it lands on the *line* holding `index`. */
export function scrollToIndex(index: number): void {
    const rowH = currentRowH();
    const columns = currentColumns();
    scrollTop = clampScrollTop(Math.floor(index / columns) * rowH, allRows.length, rowH, viewportHeight, columns);
    syncContainerScrollTop();
    publishWindow();
}

/** Feature 08.7.4: scrolls just enough to bring `index` into the visible (non-overscan) viewport — a no-op if it's already visible. Selection drives scroll, never the other way around. */
export function ensureIndexVisible(index: number): void {
    const rowH = currentRowH();
    const columns = currentColumns();
    if (rowH <= 0 || visibleCount <= 0) return;
    const line = Math.floor(index / columns);
    const firstLine = Math.floor(scrollTop / rowH);
    const lastLine = firstLine + visibleCount - 1;
    if (line < firstLine) {
        scrollToIndex(index);
    } else if (line > lastLine) {
        scrollToIndex(Math.max(0, line - visibleCount + 1) * columns);
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
    const rowH = currentRowH();
    const columns = currentColumns();
    const line = Math.floor(index / columns);
    if (visibleCount > 0 && rowH > 0) {
        const firstLine = Math.floor(scrollTop / rowH);
        if (line >= firstLine && line < firstLine + visibleCount) return;
    }
    scrollToIndex(Math.max(0, line - REVEAL_LEAD_ROWS) * columns);
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
    const result = computeWindow({
        scrollTop,
        rowH: currentRowH(),
        overscan: OVERSCAN,
        visibleCount,
        totalRows: allRows.length,
        columns: currentColumns(),
    });
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
    writeGridCustomProperties();

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
    densityRowH = rowHeight('comfortable');
    grid = null;
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
