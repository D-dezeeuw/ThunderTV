/**
 * The plain-memory query layer masterplan §5.4 mandates: the full parsed
 * channel array is a module-level variable, never Spektrum state — handing
 * 90k rows to `data-each` would make every keystroke a 90k-row diff.
 * `src/ui/` (Phase 08's virtual-list controller) reads through `getRows()`/
 * `query()` and publishes only the windowed slice to state.
 *
 * Stub for Phase 06 (Feature 05.8.3): the `Channel` shape here is
 * provisional — Phase 06's real parser owns the authoritative type and may
 * adjust it; this file's job today is only to prove the module-memory
 * pattern exists and is where bulk rows belong, ahead of anything that
 * writes to it.
 */
export interface Channel {
    id: string;
    name: string;
    streamUrl: string;
    logo: string | null;
    group: string | null;
    radio: boolean;
}

let allRows: Channel[] = [];

export function setRows(rows: Channel[]): void {
    allRows = rows;
}

export function getRows(): readonly Channel[] {
    return allRows;
}

/** A linear scan is fine at this layer today (no real caller yet); Phase 08's windowing controller is what actually needs to stay cheap per keystroke, via the published slice, not this function. */
export function query(predicate: (channel: Channel) => boolean): Channel[] {
    return allRows.filter(predicate);
}

export function clearRows(): void {
    allRows = [];
}
