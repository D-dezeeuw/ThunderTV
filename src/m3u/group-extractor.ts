import { MAX_GROUPS, UNGROUPED, type ChannelRow, type GroupMeta } from './types';

/**
 * Builds `GroupMeta[]` in a single pass over already-mapped rows (Feature
 * 06.6.1) — the worker calls this once, after mapping a full parse's rows,
 * never per-chunk (group membership can span chunk boundaries). Preserves
 * playlist order of first appearance; `firstIndex` is that group's first
 * row position in the full channel array, so the Phase 08 group view can
 * jump to it with one multiplication instead of a scan.
 *
 * Missing/blank `group` values bucket into `UNGROUPED`, appended last
 * (Feature 06.6.3). Group names are trimmed but case-sensitive — "News"
 * and "NEWS" stay distinct groups, matching thunder-tv's own behavior
 * (Feature 06.6.4's decision note: trimming avoids accidental duplicate
 * buckets from stray whitespace, but re-casing would silently merge
 * providers' deliberately distinct group naming).
 *
 * Caps distinct groups at `MAX_GROUPS` (Feature 06.6.7) — a pathological
 * playlist with more than 10,000 distinct group names folds every group
 * past the cap into `UNGROUPED` instead of growing the group list
 * unbounded, so the Phase 08 UI can always trust the bound.
 */
export function extractGroups(rows: readonly ChannelRow[]): GroupMeta[] {
    const order: string[] = [];
    const counts = new Map<string, number>();
    const firstIndex = new Map<string, number>();
    let ungroupedCount = 0;
    let ungroupedFirstIndex = -1;

    rows.forEach((row, index) => {
        const name = row.group?.trim();
        if (!name) {
            if (ungroupedFirstIndex === -1) ungroupedFirstIndex = index;
            ungroupedCount += 1;
            return;
        }

        const atCap = !counts.has(name) && order.length >= MAX_GROUPS;
        const bucket = atCap ? UNGROUPED : name;

        if (bucket === UNGROUPED) {
            if (ungroupedFirstIndex === -1) ungroupedFirstIndex = index;
            ungroupedCount += 1;
            return;
        }

        if (!counts.has(bucket)) {
            order.push(bucket);
            firstIndex.set(bucket, index);
        }
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    });

    const groups: GroupMeta[] = order.map((name) => ({
        name,
        count: counts.get(name) ?? 0,
        firstIndex: firstIndex.get(name) ?? 0,
    }));

    if (ungroupedCount > 0) {
        groups.push({ name: UNGROUPED, count: ungroupedCount, firstIndex: ungroupedFirstIndex });
    }

    if (import.meta.env.DEV) {
        assertGroupCountsCoverAllRows(groups, rows.length);
    }

    return groups;
}

/** Dev-mode invariant (Feature 06.6.8): every row belongs to exactly one group, `UNGROUPED` included. */
function assertGroupCountsCoverAllRows(groups: readonly GroupMeta[], totalRows: number): void {
    const sum = groups.reduce((total, group) => total + group.count, 0);
    if (sum !== totalRows) {
        console.warn(
            `[ThunderTV] m3u: group counts summed to ${String(sum)} but there are ${String(totalRows)} rows — a row was double-counted or missed.`,
        );
    }
}
