import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PER_SOURCE_LIST_STATE,
    LIST_STATE_LRU_CAP,
    getPerSourceListState,
    upsertListState,
    type ListStateMap,
} from './list-state';

describe('getPerSourceListState()/upsertListState() (Feature 08.6.1/08.6.7)', () => {
    it('returns the default for a source never saved', () => {
        expect(getPerSourceListState({}, 'p1')).toEqual(DEFAULT_PER_SOURCE_LIST_STATE);
    });

    it('merges a patch onto the existing entry, leaving other fields untouched', () => {
        const map: ListStateMap = { p1: { ...DEFAULT_PER_SOURCE_LIST_STATE, scrollTop: 100 } };
        const next = upsertListState(map, 'p1', { activeGroup: 'News' });
        expect(next['p1']).toEqual({ ...DEFAULT_PER_SOURCE_LIST_STATE, scrollTop: 100, activeGroup: 'News' });
    });

    it('never mutates the input map', () => {
        const map: ListStateMap = { p1: DEFAULT_PER_SOURCE_LIST_STATE };
        upsertListState(map, 'p1', { scrollTop: 50 });
        expect(map['p1']?.scrollTop).toBe(0);
    });

    it('evicts the least-recently-touched source past the LRU cap', () => {
        let map: ListStateMap = {};
        for (let i = 0; i < LIST_STATE_LRU_CAP; i++) {
            map = upsertListState(map, `p${String(i)}`, { scrollTop: i });
        }
        expect(Object.keys(map)).toHaveLength(LIST_STATE_LRU_CAP);

        map = upsertListState(map, 'new-source', { scrollTop: 999 });
        expect(Object.keys(map)).toHaveLength(LIST_STATE_LRU_CAP);
        expect(map['p0']).toBeUndefined(); // oldest evicted
        expect(map['new-source']).toBeDefined();
    });

    it('touching an existing entry moves it to most-recently-used, protecting it from eviction', () => {
        let map: ListStateMap = {};
        for (let i = 0; i < LIST_STATE_LRU_CAP; i++) {
            map = upsertListState(map, `p${String(i)}`, { scrollTop: i });
        }
        map = upsertListState(map, 'p0', { scrollTop: 12345 }); // re-touch the oldest
        map = upsertListState(map, 'overflow', {});
        expect(map['p0']?.scrollTop).toBe(12345); // survived
        expect(map['p1']).toBeUndefined(); // now the oldest, evicted instead
    });
});
