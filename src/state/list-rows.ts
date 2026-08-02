import type { ChannelRow } from '../m3u/types';
import { indexOfRow, revealIndex, setRows as setVirtualListRows } from '../ui/virtual-list';
import { selectChannel } from './list.actions';
import { LIST_SELECTED_ID } from './list';
import { PLAYER_ACTIVE } from './player';
import type { ActiveChannelSnapshot } from './records';
import { get } from './typed';

export interface SetDisplayedRowsOptions {
    scrollTop?: number;
    /** Explicit selection to apply (e.g. a restored value) — omitted, the current selection is re-validated against the new set instead. */
    selectedId?: string | null;
    /** This publish appends to the set already on screen rather than replacing it — leave the viewer's scroll position alone (see `ui/virtual-list.ts`'s `SetRowsOptions`). */
    preserveScroll?: boolean;
}

/**
 * A channel id the *next* publish should scroll onto the screen, armed by
 * the Starred/Recent replay path. One-shot: the publish that consumes it
 * clears it, so a later, unrelated republish never yanks the list around.
 *
 * It has to be deferred like this because the row set that will contain the
 * row does not exist yet at click time — the target view republishes on
 * arrival (`live.actions.ts`'s `publishRowsForCurrentView()`), and that
 * republish resets the scroll to the top.
 */
let pendingRevealId: string | null = null;

/** Asks the next `setDisplayedRows()` to put this channel's row on screen. */
export function revealRowOnNextPublish(id: string): void {
    pendingRevealId = id;
}

/**
 * The id of the row in `rows` that represents `id` — the row itself, or the
 * grouped row that collapsed it into a variant.
 *
 * The variant hop is what makes a starred or recently-watched channel land
 * on the right row after the Live view has regrouped: Live shows one row per
 * channel keyed on its *primary* feed (`channels/grouping.ts`'s
 * `toDisplayRows()`), so an entry captured from Categories — or from a
 * different primary, since the primary is whichever variant sorts best —
 * carries an id that no Live row wears on the outside.
 */
function rowIdFor(rows: readonly ChannelRow[], id: string | null): string | null {
    if (id === null) return null;
    if (rows.some((row) => row.id === id)) return id;
    return rows.find((row) => row.variants?.some((variant) => variant.id === id))?.id ?? null;
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
    setVirtualListRows(rows, {
        ...(options.scrollTop !== undefined ? { scrollTop: options.scrollTop } : {}),
        ...(options.preserveScroll ? { preserveScroll: true } : {}),
    });

    // A publish that only appends is not the arrival republish a reveal is
    // waiting for: the row it names may not have loaded yet, and consuming
    // it here would both lose the reveal and scroll a viewer who is reading
    // the rows that *have* loaded.
    const reveal = options.preserveScroll ? null : pendingRevealId;
    if (!options.preserveScroll) pendingRevealId = null;

    // A pending reveal outranks both: it names the row the viewer just
    // clicked, in the view they were sent to see it in.
    const revealId = rowIdFor(rows, reveal);
    const requestedId = options.selectedId !== undefined ? options.selectedId : (get<string | null>(LIST_SELECTED_ID) ?? null);
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

    const selectedId = revealId ?? rowIdFor(rows, requestedId) ?? rowIdFor(rows, activeId) ?? rows[0]?.id ?? null;
    selectChannel(selectedId);

    // A row nobody can see is indistinguishable from no selection at all —
    // the Live list runs to thousands of rows, and `setRows()` above just put
    // the scroll back at the top.
    if (revealId !== null) revealIndex(indexOfRow(revealId));
}
