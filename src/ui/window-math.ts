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
    rowH: number;
    overscan: number;
    /** Rows that fit the viewport at the current row height (Feature 08.1.6). */
    visibleCount: number;
    totalRows: number;
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

    if (totalRows <= 0 || rowH <= 0) {
        return { sliceStart: 0, sliceEnd: 0, padTop: 0, padBottom: 0 };
    }

    const maxFirst = totalRows - 1;
    const rawFirst = Math.floor(Math.max(scrollTop, 0) / rowH);
    const first = Math.min(Math.max(rawFirst, 0), maxFirst);

    const sliceStart = Math.max(0, first - overscan);
    const sliceEnd = Math.min(totalRows, first + Math.max(visibleCount, 0) + overscan);

    const padTop = sliceStart * rowH;
    const padBottom = Math.max(0, (totalRows - sliceEnd) * rowH);

    return { sliceStart, sliceEnd, padTop, padBottom };
}

/** Rows that fit a viewport of `viewportHeight` px at `rowH` px each (Feature 08.1.6) — always at least 1 so a just-opened, not-yet-measured container still publishes a usable window. */
export function computeVisibleCount(viewportHeight: number, rowH: number): number {
    if (rowH <= 0) return 0;
    return Math.max(1, Math.ceil(Math.max(viewportHeight, 0) / rowH));
}

/** Clamps a candidate `scrollTop` into the real scrollable range for `totalRows` at `rowH`, given the current `viewportHeight` (Feature 08.1.8/08.6.5) — used both for live scroll events and for restoring a persisted position against a list that may have shrunk since it was saved. */
export function clampScrollTop(scrollTop: number, totalRows: number, rowH: number, viewportHeight: number): number {
    const maxScrollTop = Math.max(0, totalRows * rowH - viewportHeight);
    return Math.min(Math.max(scrollTop, 0), maxScrollTop);
}
