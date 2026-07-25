import { describe, expect, it } from 'vitest';
import { pushCapped } from './collections';

interface Item {
    id: string;
    label: string;
}

const idOf = (item: Item): string => item.id;

describe('pushCapped', () => {
    it('pushes a new item to the front', () => {
        const result = pushCapped<Item>([{ id: 'b', label: 'B' }], { id: 'a', label: 'A' }, 20, idOf);
        expect(result.map((i) => i.id)).toEqual(['a', 'b']);
    });

    it('dedupes an existing id, replacing it at the front instead of leaving it stale further back', () => {
        const list: Item[] = [
            { id: 'a', label: 'A-old' },
            { id: 'b', label: 'B' },
        ];
        const result = pushCapped(list, { id: 'a', label: 'A-new' }, 20, idOf);
        expect(result).toEqual([
            { id: 'a', label: 'A-new' },
            { id: 'b', label: 'B' },
        ]);
    });

    it('truncates to the cap', () => {
        const list: Item[] = Array.from({ length: 5 }, (_, i) => ({ id: `id-${String(i)}`, label: `L${String(i)}` }));
        const result = pushCapped(list, { id: 'new', label: 'New' }, 3, idOf);
        expect(result).toHaveLength(3);
        expect(result[0]?.id).toBe('new');
    });

    it('exact-boundary cap of 1 keeps only the pushed item', () => {
        const result = pushCapped<Item>([{ id: 'a', label: 'A' }], { id: 'b', label: 'B' }, 1, idOf);
        expect(result).toEqual([{ id: 'b', label: 'B' }]);
    });

    it('never mutates the input list', () => {
        const list: Item[] = [{ id: 'a', label: 'A' }];
        const snapshot = [...list];
        pushCapped(list, { id: 'b', label: 'B' }, 20, idOf);
        expect(list).toEqual(snapshot);
    });
});
