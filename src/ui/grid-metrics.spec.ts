import { describe, expect, it } from 'vitest';
import { gridColumns, gridTileHeight } from './grid-metrics';

describe('gridColumns()', () => {
    it('lands on the documented counts at each end of the range', () => {
        expect(gridColumns(1920)).toBe(8);
        expect(gridColumns(1280)).toBe(6);
        expect(gridColumns(800)).toBe(4);
        expect(gridColumns(520)).toBe(3);
    });

    it('never drops below two columns, however narrow the container', () => {
        expect(gridColumns(320)).toBe(2);
        expect(gridColumns(0)).toBe(2);
        expect(gridColumns(-100)).toBe(2);
    });

    it('is monotonic — a wider container never shows fewer tiles across', () => {
        let previous = 0;
        for (let width = 0; width <= 2200; width += 20) {
            const columns = gridColumns(width);
            expect(columns).toBeGreaterThanOrEqual(previous);
            previous = columns;
        }
    });
});

describe('gridTileHeight()', () => {
    it('gives a poster its 2:3 artwork plus a title line', () => {
        // 1200 / 6 = 200px wide → 300px of poster + the title block.
        expect(gridTileHeight(1200, 6, 'poster')).toBe(334);
    });

    it('gives a square logo a shorter tile at the same width', () => {
        expect(gridTileHeight(1200, 6, 'square')).toBeLessThan(gridTileHeight(1200, 6, 'poster'));
    });

    it('stays a usable height for a container that has not been measured yet', () => {
        expect(gridTileHeight(0, 0, 'poster')).toBeGreaterThan(0);
    });
});
