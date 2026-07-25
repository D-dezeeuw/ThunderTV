/**
 * Bounded-collection helpers shared by every module that caches a capped
 * list in Spektrum state (zap history, recent, favorites) — masterplan §6.3.
 */

/**
 * Pushes `item` to the front, de-duplicating by `idOf` (an existing entry
 * with the same id is dropped, not left stale further back), and truncates
 * to `cap`. Never mutates `list` — always returns a new array, since the
 * result is handed straight to `setValue`.
 */
export function pushCapped<T>(list: readonly T[], item: T, cap: number, idOf: (value: T) => unknown): T[] {
    const id = idOf(item);
    const deduped = list.filter((existing) => idOf(existing) !== id);
    return [item, ...deduped].slice(0, cap);
}
