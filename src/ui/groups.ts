import type { ChannelRow } from '../m3u/types';
import { UNGROUPED } from '../m3u/types';

/**
 * Group-view filtering (Feature 08.5) — pure, no Spektrum/DOM. Operates over
 * whatever row array the caller passes (normally the active source's full
 * row set); the group panel and jump/expand actions both go through this.
 *
 * Deliberate scope limitation (documented, not silently dropped): this
 * filters by an exact `row.group` match (falsy/blank → `UNGROUPED`), it does
 * not reproduce `group-extractor.ts`'s `MAX_GROUPS` first-10000-distinct-
 * names cap-folding. A playlist past that cap (Feature 06.6.7's stress
 * fixture) would show a handful of over-the-cap rows under their own name
 * here instead of folded into `UNGROUPED`, a narrow inconsistency with the
 * groups *panel*'s counts (which are computed by the capped
 * `extractGroups()`). No realistic playlist reaches 10,000 distinct groups.
 */

let cache = new Map<string, ChannelRow[]>();
let cacheSourceRows: readonly ChannelRow[] | null = null;

/** Feature 08.5.4: builds (and memory-caches) the filtered row list for one group, keyed by group name — invalidated whenever the caller passes a different `rows` array identity (a new source, or a refresh). */
export function rowsForGroup(rows: readonly ChannelRow[], groupName: string): ChannelRow[] {
    if (cacheSourceRows !== rows) {
        cache = new Map();
        cacheSourceRows = rows;
    }
    const cached = cache.get(groupName);
    if (cached) return cached;

    const filtered =
        groupName === UNGROUPED
            ? rows.filter((row) => !row.group || row.group.trim() === '')
            : rows.filter((row) => row.group?.trim() === groupName);
    cache.set(groupName, filtered);
    return filtered;
}

/** Test-only / source-switch hook: drops the cache so a stale filtered array from a previous source can never leak into a new one. @internal */
export function resetGroupCache(): void {
    cache = new Map();
    cacheSourceRows = null;
}
