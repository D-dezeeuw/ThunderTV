import { describe, expect, it } from 'vitest';
import { extractGroups } from './group-extractor';
import { MAX_GROUPS, UNGROUPED, type ChannelRow } from './types';

function row(group: string | null, overrides: Partial<ChannelRow> = {}): ChannelRow {
    return {
        id: crypto.randomUUID(),
        name: 'x',
        url: 'https://example.com/x',
        group,
        logo: null,
        tvgId: null,
        radio: false,
        ...overrides,
    };
}

describe('extractGroups', () => {
    it('returns an empty array for an empty playlist (Feature 06.6.10)', () => {
        expect(extractGroups([])).toEqual([]);
    });

    it('buckets an all-ungrouped playlist into exactly one Ungrouped entry (Feature 06.6.10)', () => {
        const rows = [row(null), row(null), row('')];
        expect(extractGroups(rows)).toEqual([{ name: UNGROUPED, count: 3, firstIndex: 0 }]);
    });

    it('lands a whitespace-only group-title in Ungrouped (Feature 06.6.10)', () => {
        const rows = [row('  ')];
        expect(extractGroups(rows)).toEqual([{ name: UNGROUPED, count: 1, firstIndex: 0 }]);
    });

    it("preserves order of first appearance, with firstIndex at each group's true first occurrence, even non-contiguous (Feature 06.6.2/06.6.9)", () => {
        const rows = [row('A'), row('B'), row('A'), row('C'), row('B')];
        expect(extractGroups(rows)).toEqual([
            { name: 'A', count: 2, firstIndex: 0 },
            { name: 'B', count: 2, firstIndex: 1 },
            { name: 'C', count: 1, firstIndex: 3 },
        ]);
    });

    it('appends Ungrouped after real groups', () => {
        const rows = [row('A'), row(null), row('A')];
        expect(extractGroups(rows)).toEqual([
            { name: 'A', count: 2, firstIndex: 0 },
            { name: UNGROUPED, count: 1, firstIndex: 1 },
        ]);
    });

    it('trims group names but keeps case-sensitive identity (Feature 06.6.4)', () => {
        const rows = [row(' News '), row('News'), row('NEWS')];
        const groups = extractGroups(rows);
        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.name)).toEqual(['News', 'NEWS']);
        expect(groups[0]?.count).toBe(2);
        expect(groups[1]?.count).toBe(1);
    });

    it('caps distinct groups and folds overflow into Ungrouped (Feature 06.6.7)', () => {
        const rows = Array.from({ length: MAX_GROUPS + 5 }, (_, i) => row(`Group ${String(i)}`));
        const groups = extractGroups(rows);

        expect(groups).toHaveLength(MAX_GROUPS + 1);
        const overflow = groups.find((g) => g.name === UNGROUPED);
        expect(overflow?.count).toBe(5);
    });

    it('every row belongs to exactly one group (sum of counts equals total rows)', () => {
        const rows = [row('A'), row(null), row('B'), row('A'), row('')];
        const groups = extractGroups(rows);
        const sum = groups.reduce((total, g) => total + g.count, 0);
        expect(sum).toBe(rows.length);
    });
});
