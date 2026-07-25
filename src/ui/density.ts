export type Density = 'compact' | 'comfortable';

const ROW_HEIGHT: Record<Density, number> = {
    compact: 32,
    comfortable: 44,
};

/**
 * The single number the Phase 08 virtual-list windowing controller may use
 * for row height — never measured from the DOM. Must stay in sync with the
 * `--row-h` values in tokens.css's `[data-density='compact']` override.
 *
 * The `setDensity` action itself lives in `src/state/ui.actions.ts` as of
 * Phase 05's action-layer consolidation (Feature 05.2.3) — this file keeps
 * only the pure, render-adjacent lookup.
 */
export function rowHeight(density: Density): number {
    return ROW_HEIGHT[density];
}
