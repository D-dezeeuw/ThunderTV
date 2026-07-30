import type { ChannelRow } from '../m3u/types';
import { setRows as setVirtualListRows } from '../ui/virtual-list';
import { selectChannel } from './list.actions';
import { LIST_SELECTED_ID } from './list';
import { PLAYER_ACTIVE } from './player';
import type { ActiveChannelSnapshot } from './records';
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
 * doesn't exist in the new row set falls back to the playing channel, then to
 * the first row, instead of silently pointing at nothing.
 */
export function setDisplayedRows(rows: readonly ChannelRow[], options: SetDisplayedRowsOptions = {}): void {
    setVirtualListRows(rows, options.scrollTop !== undefined ? { scrollTop: options.scrollTop } : {});

    const has = (id: string | null): boolean => id !== null && rows.some((row) => row.id === id);

    const requestedId = options.selectedId !== undefined ? options.selectedId : (get<string | null>(LIST_SELECTED_ID) ?? null);
    if (has(requestedId)) {
        selectChannel(requestedId);
        return;
    }

    // Before falling back to the first row: if something is actually playing
    // and this row set contains it, that is the row the cursor belongs on.
    //
    // This is what makes replaying from Starred/Recents land correctly. Those
    // actions set the selection and then navigate, and the target view
    // republishes its rows on arrival — a republish that re-reads the
    // selection through `get()`, which does not see a `setValue()` from the
    // same turn until the queue drains. So the freshly-set cursor could still
    // look absent here and get handed to row 0, highlighting an unrelated
    // channel while a different one played.
    const activeId = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.id ?? null;
    if (has(activeId)) {
        selectChannel(activeId);
        return;
    }

    selectChannel(rows[0]?.id ?? null);
}
