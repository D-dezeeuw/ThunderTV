import { describe, expect, it } from 'vitest';
import type { XtreamCategory } from '../xtream/types';
import { createCategoryRail } from './catalog-category-tree';

/**
 * The string work that decides what the Movies/TV Shows rail actually reads
 * — which of a provider's dozen NETFLIX categories becomes the row, and what
 * the ones behind it are called. Everything else in the module is bookkeeping
 * a typecheck already proves.
 */
const CAP = 500;

function categories(...names: string[]): XtreamCategory[] {
    return names.map((name, i) => ({ id: String(i + 1), name }));
}

function railFor(...names: string[]) {
    const rail = createCategoryRail();
    rail.setCategories(categories(...names), 'NL', CAP);
    return rail;
}

describe('catalog category accordion', () => {
    it("keeps the viewer's own country as the head and labels the rest by what differs", () => {
        const rail = railFor(
            '| FR | NETFLIX',
            '| NL | NETFLIX KIDS',
            '| NL | NETFLIX',
            '| US | NETFLIX BLACK LEAD',
        );

        expect(rail.rows()).toEqual([
            { id: '3', name: 'NETFLIX', hasVariants: true, expanded: false, variant: false },
        ]);

        rail.toggle('3');
        expect(rail.rows().map((row) => row.name)).toEqual([
            'NETFLIX',
            'KIDS',
            'FR',
            'US · BLACK LEAD',
        ]);
        expect(rail.rows().slice(1).every((row) => row.variant)).toBe(true);
    });

    it('leaves a category no other shares alone — no triangle, no nesting', () => {
        const rail = railFor('| NL | NETFLIX', '| NL | DOCUMENTAIRES');
        expect(rail.rows().map((row) => [row.name, row.hasVariants])).toEqual([
            ['NETFLIX', false],
            ['DOCUMENTAIRES', false],
        ]);
    });

    it('groups an unnamed service only on an identical label, so a qualifier is never mistaken for a country', () => {
        const rail = railFor('| NL | ACTIE', '| FR | ACTIE', '| NL | ACTIE 4K');
        expect(rail.rows().map((row) => row.name)).toEqual(['ACTIE', 'ACTIE 4K']);

        rail.toggle('1');
        expect(rail.rows().map((row) => row.name)).toEqual(['ACTIE', 'FR', 'ACTIE 4K']);
    });

    it('recognizes the head under whichever spelling the panel used that time', () => {
        const rail = railFor('| NL | DISNEY+', '| FR | DISNEY PLUS');
        rail.toggle('1');
        // Not "FR · DISNEY PLUS": the service name is what the two share.
        expect(rail.rows().map((row) => row.name)).toEqual(['DISNEY+', 'FR']);
    });

    it('falls back to the raw provider name when two variants differ in nothing else', () => {
        const rail = railFor('| NL | NETFLIX', '[HD] NETFLIX');
        rail.toggle('1');
        expect(rail.rows()[1]?.name).toBe('[HD] NETFLIX');
    });

    it('reveals the group holding a variant, so a selected one is never hidden', () => {
        const rail = railFor('| NL | NETFLIX', '| FR | NETFLIX');
        expect(rail.rows()).toHaveLength(1);

        expect(rail.reveal('2')).toBe(true);
        expect(rail.rows().map((row) => row.id)).toEqual(['1', '2']);
        // A head is already its own row — revealing it must not expand it.
        expect(rail.reveal('1')).toBe(false);
    });

    it('reports every category its full name, collapsed variants included', () => {
        const rail = railFor('| NL | NETFLIX', '| US | NETFLIX BLACK LEAD');
        expect(rail.displayName('2')).toBe('NETFLIX BLACK LEAD');
        expect(rail.displayName('nope')).toBeNull();
    });
});
