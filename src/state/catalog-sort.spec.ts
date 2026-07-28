import { describe, expect, it } from 'vitest';
import type { XtreamCategory } from '../xtream/types';
import { sortCategoriesCountryFirst } from './catalog-sort';

const categories: XtreamCategory[] = [
    { id: '1', name: 'US | MOVIES' },
    { id: '2', name: 'DE | FILME' },
    { id: '3', name: 'DE | SERIEN' },
    { id: '4', name: 'FR | FILMS' },
];

describe('sortCategoriesCountryFirst()', () => {
    it('sorts a non-NL country first, preserving original order within each group', () => {
        const sorted = sortCategoriesCountryFirst(categories, 'DE');
        expect(sorted.map((c) => c.id)).toEqual(['2', '3', '1', '4']);
    });

    it('also matches a country/language name synonym, not only the bracket code', () => {
        const withSynonym: XtreamCategory[] = [...categories, { id: '5', name: 'German Movies' }];
        const sorted = sortCategoriesCountryFirst(withSynonym, 'DE');
        expect(sorted.slice(0, 3).map((c) => c.id)).toEqual(['2', '3', '5']);
    });

    it('falls back to NL when the country code is empty', () => {
        const withNl: XtreamCategory[] = [...categories, { id: '5', name: 'NL | FILMS' }];
        const sorted = sortCategoriesCountryFirst(withNl, '');
        expect(sorted[0]?.id).toBe('5');
    });

    it('is a stable no-op when nothing matches (unknown country code)', () => {
        const sorted = sortCategoriesCountryFirst(categories, 'ZZ');
        expect(sorted.map((c) => c.id)).toEqual(['1', '2', '3', '4']);
    });
});
