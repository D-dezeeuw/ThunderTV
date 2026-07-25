import { describe, expect, it } from 'vitest';
import { rowHeight } from './density';

describe('rowHeight', () => {
    it('maps compact to 32', () => {
        expect(rowHeight('compact')).toBe(32);
    });

    it('maps comfortable to 44', () => {
        expect(rowHeight('comfortable')).toBe(44);
    });
});
