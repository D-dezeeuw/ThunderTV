import { describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { UNGROUPED } from '../m3u/types';
import { resetGroupCache, rowsForGroup } from './groups';

function row(id: string, group: string | null): ChannelRow {
    return { id, name: `Channel ${id}`, url: `https://example.com/${id}.m3u8`, group, logo: null, tvgId: null, radio: false };
}

describe('rowsForGroup() (Feature 08.5.4)', () => {
    it('filters rows by exact group name', () => {
        const rows = [row('1', 'News'), row('2', 'Sports'), row('3', 'News')];
        expect(rowsForGroup(rows, 'News').map((r) => r.id)).toEqual(['1', '3']);
    });

    it('buckets blank/missing group values into UNGROUPED', () => {
        const rows = [row('1', null), row('2', '  '), row('3', 'News')];
        expect(rowsForGroup(rows, UNGROUPED).map((r) => r.id)).toEqual(['1', '2']);
    });

    it('trims group names before comparing', () => {
        const rows = [row('1', '  News  ')];
        expect(rowsForGroup(rows, 'News')).toHaveLength(1);
    });

    it('returns an empty array for a group with no members', () => {
        expect(rowsForGroup([row('1', 'News')], 'Sports')).toEqual([]);
    });

    it('caches the filtered result per group name for the same rows array', () => {
        const rows = [row('1', 'News')];
        const first = rowsForGroup(rows, 'News');
        const second = rowsForGroup(rows, 'News');
        expect(first).toBe(second);
    });

    it('invalidates the cache when the rows array identity changes', () => {
        const rowsA = [row('1', 'News')];
        const rowsB = [row('2', 'News')];
        const first = rowsForGroup(rowsA, 'News');
        const second = rowsForGroup(rowsB, 'News');
        expect(first).not.toBe(second);
        expect(second.map((r) => r.id)).toEqual(['2']);
    });

    it('resetGroupCache() clears memoized results', () => {
        const rows = [row('1', 'News')];
        const first = rowsForGroup(rows, 'News');
        resetGroupCache();
        const second = rowsForGroup(rows, 'News');
        expect(first).not.toBe(second);
        expect(second).toEqual(first);
    });
});
