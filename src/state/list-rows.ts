import type { ChannelRow } from '../m3u/types';
import { setRows as setVirtualListRows } from '../ui/virtual-list';
import { selectChannel } from './list.actions';
import { LIST_SELECTED_ID } from './list';
import { get } from './typed';

export interface SetDisplayedRowsOptions {
    scrollTop?: number;
    /** Explicit selection to apply (e.g. a restored value) — omitted, the current selection is re-validated against the new set instead. */
    selectedId?: string | null;
}

/**
 * The single choke point every caller uses to change what the virtual list
 * displays (Feature 08.10.4) — `loadActiveSource()`, group expansion, and
 * (Phase 09) search all call this, never `virtual-list.ts`'s `setRows()`
 * directly. Wraps the windowing swap with the one state-layer side effect it
 * always needs: selection invalidation (Feature 08.7.9) — a selected id that
 * doesn't exist in the new row set falls back to the first row instead of
 * silently pointing at nothing.
 */
export function setDisplayedRows(rows: readonly ChannelRow[], options: SetDisplayedRowsOptions = {}): void {
    setVirtualListRows(rows, options.scrollTop !== undefined ? { scrollTop: options.scrollTop } : {});

    const requestedId = options.selectedId !== undefined ? options.selectedId : (get<string | null>(LIST_SELECTED_ID) ?? null);
    const stillPresent = requestedId !== null && rows.some((row) => row.id === requestedId);
    selectChannel(stillPresent ? requestedId : (rows[0]?.id ?? null));
}
