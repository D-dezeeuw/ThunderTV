/**
 * The plain-memory query layer masterplan §5.4 mandates: the full parsed
 * channel array is a module-level variable, never Spektrum state — handing
 * 90k rows to `data-each` would make every keystroke a 90k-row diff.
 * `src/ui/` (Phase 08's virtual-list controller) reads through `getRows()`/
 * `query()` and publishes only the windowed slice to state.
 *
 * `ChannelRow` (`src/m3u/types.ts`) is the authoritative shape as of Phase
 * 06 — the Phase 05 stub `Channel` interface that used to live here is
 * gone; `parser-client.ts` calls `setRows()` with exactly the rows it just
 * bulk-put into the `channels` storage table.
 */
import type { ChannelRow } from './types';

let allRows: ChannelRow[] = [];

export function setRows(rows: ChannelRow[]): void {
    allRows = rows;
}

export function getRows(): readonly ChannelRow[] {
    return allRows;
}

/** A linear scan is fine at this layer today (no real caller yet); Phase 08's windowing controller is what actually needs to stay cheap per keystroke, via the published slice, not this function. */
export function query(predicate: (channel: ChannelRow) => boolean): ChannelRow[] {
    return allRows.filter(predicate);
}

export function clearRows(): void {
    allRows = [];
}
