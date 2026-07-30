/**
 * The grid layout's two numbers — how many tiles fit across, and how tall a
 * line of them is. Pure, so the windowing math they feed stays provable
 * without a DOM (same split as `window-math.ts` vs. `virtual-list.ts`).
 *
 * Columns are decided here in JS rather than by a CSS `auto-fill` track,
 * because the virtual list needs the exact same number the browser lays out
 * with: the scroll extent is `ceil(rows / columns) * tileHeight`, and a
 * disagreement of one column shows up as rows the user can scroll past but
 * never see. `virtual-list.ts` publishes both values back to CSS as
 * `--grid-cols`/`--grid-tile-h`, so the stylesheet consumes them instead of
 * deriving its own.
 */

/**
 * A movie/series poster is 2:3; a channel logo is roughly square. Same tile
 * template either way — only how much room the artwork gets differs.
 */
export type TileShape = 'poster' | 'square';

const MEDIA_RATIO: Record<TileShape, number> = {
    poster: 1.5,
    square: 1,
};

/** Room under the artwork for the (single-line, truncated) title. */
const TITLE_BLOCK_PX = 34;

const MIN_TILE_H = 96;
const MAX_TILE_H = 460;

/**
 * Widest-first, so the first match wins. Six across on a desktop window,
 * three on a phone — the rest are the steps in between, chosen so a tile
 * never leaves the ~150–260px band a poster reads well at.
 */
const COLUMN_STEPS: ReadonlyArray<{ minWidth: number; columns: number }> = [
    { minWidth: 1600, columns: 8 },
    { minWidth: 1280, columns: 6 },
    { minWidth: 1000, columns: 5 },
    { minWidth: 760, columns: 4 },
    { minWidth: 480, columns: 3 },
];

const MIN_COLUMNS = 2;

/** Tiles across for a list container `width` px wide. Never below 2 — a one-column "grid" is just the list layout with wasted space. */
export function gridColumns(width: number): number {
    for (const step of COLUMN_STEPS) {
        if (width >= step.minWidth) return step.columns;
    }
    return MIN_COLUMNS;
}

/**
 * The fixed height of one line of tiles — the value that plays the role
 * `density.ts`'s `rowHeight()` plays for the list layout, and is just as
 * load-bearing: every pad height and slice bound is a multiple of it, so it
 * must be derived, never measured back off the DOM.
 */
export function gridTileHeight(width: number, columns: number, shape: TileShape): number {
    const tileWidth = width / Math.max(columns, 1);
    const height = Math.round(tileWidth * MEDIA_RATIO[shape]) + TITLE_BLOCK_PX;
    return Math.min(MAX_TILE_H, Math.max(MIN_TILE_H, height));
}
