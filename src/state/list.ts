import { setValue } from 'spektrum';
import type { ChannelRow } from '../m3u/types';

/**
 * The virtual-list window (masterplan §5.4/§6.1) — the only Spektrum-state
 * surface a 90k-row playlist ever touches. `visibleRows` is always the
 * overscan-bounded slice (~40 rows max); the full array lives in module
 * memory (`src/ui/virtual-list.ts`), never here.
 *
 * Constants/types/init only — `registry.ts` imports these, and importing
 * `state/typed.ts` (which itself reaches back into `registry.ts` via
 * `bulk-policy.ts`) from *this* file would be a real ESM import cycle (the
 * same class of bug `list-state.ts`'s header comment documents — a
 * computed `[KEY]: {...}` object key can silently resolve to `undefined`
 * while the cycle is still settling). `state/list-publish.ts` holds the one
 * function (`publishListWindow`) that needs the typed bulk-data guard.
 */
export const LIST_VISIBLE_ROWS = 'list.visibleRows';
export const LIST_PAD_TOP = 'list.padTop';
export const LIST_PAD_BOTTOM = 'list.padBottom';
/** The keyboard/click selection cursor (Feature 08.7.2) — distinct from `player.active` (what is playing). */
export const LIST_SELECTED_ID = 'list.selectedId';

export interface ListState {
    visibleRows: ChannelRow[];
    padTop: number;
    padBottom: number;
    selectedId: string | null;
}

export const LIST_DEFAULTS: ListState = {
    visibleRows: [],
    padTop: 0,
    padBottom: 0,
    selectedId: null,
};

export function initListState(): void {
    setValue(LIST_VISIBLE_ROWS, LIST_DEFAULTS.visibleRows);
    setValue(LIST_PAD_TOP, LIST_DEFAULTS.padTop);
    setValue(LIST_PAD_BOTTOM, LIST_DEFAULTS.padBottom);
    setValue(LIST_SELECTED_ID, LIST_DEFAULTS.selectedId);
}

/** The selection cursor is a scalar id, written by `state/list.actions.ts`'s `defineFn` actions — never directly by `virtual-list.ts`. */
export function setSelectedId(id: string | null): void {
    setValue(LIST_SELECTED_ID, id);
}
