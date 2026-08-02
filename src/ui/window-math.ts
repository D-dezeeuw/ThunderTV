/**
 * Pure windowing math (Feature 08.1.9) — no DOM, no Spektrum, no module
 * state. `virtual-list.ts` is the only caller; kept separate so the math
 * itself stays exhaustively unit-testable and independently provable.
 *
 * Row height is always a constant per density mode (masterplan §6.1) — none
 * of this ever measures anything from the DOM.
 */

export interface WindowMathInput {
    scrollTop: number;
    /** Height of one *line* — a row in the list layout, a line of tiles in the grid. */
    rowH: number;
    overscan: number;
    /** Lines that fit the viewport at the current line height (Feature 08.1.6). */
    visibleCount: number;
    totalRows: number;
    /**
     * Items per line — 1 (the default) for the list layout, N for the grid
     * (`src/ui/grid-metrics.ts`). Everything below counts in lines and only
     * multiplies back out to item indices at the slice bounds, so a grid is
     * the same math with a wider stride rather than a second implementation.
     */
    columns?: number;
}

export interface WindowMathResult {
    /** First index of the published slice (inclusive), after overscan. */
    sliceStart: number;
    /** Last index of the published slice (exclusive), after overscan. */
    sliceEnd: number;
    padTop: number;
    padBottom: number;
}

/**
 * Computes the windowed slice bounds and spacer heights for a given scroll
 * position (Feature 08.1.3/§5.4's `publishWindow()`). Clamped at every edge
 * (Feature 08.1.8): an empty list, a list shorter than the viewport, and a
 * `scrollTop` past the end (e.g. after `setRows` shrank the list) all
 * resolve to a valid, non-negative result — never a negative pad, never an
 * out-of-range slice.
 */
export function computeWindow(input: WindowMathInput): WindowMathResult {
    const { scrollTop, rowH, overscan, visibleCount, totalRows } = input;
    const columns = Math.max(1, Math.floor(input.columns ?? 1));

    if (totalRows <= 0 || rowH <= 0) {
        return { sliceStart: 0, sliceEnd: 0, padTop: 0, padBottom: 0 };
    }

    const totalLines = Math.ceil(totalRows / columns);
    const rawFirst = Math.floor(Math.max(scrollTop, 0) / rowH);
    const firstLine = Math.min(Math.max(rawFirst, 0), totalLines - 1);

    const startLine = Math.max(0, firstLine - overscan);
    const endLine = Math.min(totalLines, firstLine + Math.max(visibleCount, 0) + overscan);

    const sliceStart = startLine * columns;
    const sliceEnd = Math.min(totalRows, endLine * columns);

    const padTop = startLine * rowH;
    const padBottom = Math.max(0, (totalLines - endLine) * rowH);

    return { sliceStart, sliceEnd, padTop, padBottom };
}

/** Rows that fit a viewport of `viewportHeight` px at `rowH` px each (Feature 08.1.6) — always at least 1 so a just-opened, not-yet-measured container still publishes a usable window. */
export function computeVisibleCount(viewportHeight: number, rowH: number): number {
    if (rowH <= 0) return 0;
    return Math.max(1, Math.ceil(Math.max(viewportHeight, 0) / rowH));
}

export interface ScrollTargetInput {
    /** The controller's own last-known position. */
    current: number;
    /** Where the container really is at this instant, or `null` when there is nothing measurable — no container yet, or one hidden by a `data-if` (which reports 0 rather than where it will be). */
    live: number | null;
    /** A position the caller named explicitly: a restored session, a group jump. */
    requested?: number | undefined;
    /** This publish *appends* to the set already on screen rather than replacing it. */
    growth: boolean;
}

export interface ScrollTarget {
    scrollTop: number;
    /** Whether the container's own `scrollTop` may be assigned. */
    writeToDom: boolean;
}

/**
 * Where a `setRows()` publish leaves the viewer — the whole decision, pure,
 * so it can be reasoned about without a container.
 *
 * The growth case is the one with history behind it. Appending more channels
 * (the chunked source load, once per `CHUNK_ROWS`) used to re-assign the
 * container's `scrollTop` from the controller's last-known value. That value
 * is only as fresh as the last `scroll` event this module processed, so an
 * in-flight gesture — inertial scrolling on a touch screen, a held wheel —
 * was repeatedly yanked back to where it had been a frame or two earlier,
 * once per page, for the whole load. Growth cannot move a row that is
 * already on screen (every new row is past the end), so there is nothing to
 * re-anchor and nothing to assign: adopt whatever position the container is
 * really at and leave the DOM alone.
 */
export function resolveScrollTarget(input: ScrollTargetInput): ScrollTarget {
    // An explicit position is the caller naming one, which outranks growth —
    // the two never co-occur today, but "the caller asked" is the stronger
    // signal of the pair.
    if (input.requested !== undefined) return { scrollTop: input.requested, writeToDom: true };
    if (input.growth) return { scrollTop: input.live ?? input.current, writeToDom: false };
    // A replacement is a new list: it starts at the top, and says so.
    return { scrollTop: 0, writeToDom: true };
}

/** Clamps a candidate `scrollTop` into the real scrollable range for `totalRows` at `rowH`, given the current `viewportHeight` (Feature 08.1.8/08.6.5) — used both for live scroll events and for restoring a persisted position against a list that may have shrunk since it was saved. `columns > 1` shortens the extent proportionally, since a grid packs the same rows into fewer lines. */
export function clampScrollTop(
    scrollTop: number,
    totalRows: number,
    rowH: number,
    viewportHeight: number,
    columns = 1,
): number {
    const totalLines = Math.ceil(totalRows / Math.max(1, Math.floor(columns)));
    const maxScrollTop = Math.max(0, totalLines * rowH - viewportHeight);
    return Math.min(Math.max(scrollTop, 0), maxScrollTop);
}
