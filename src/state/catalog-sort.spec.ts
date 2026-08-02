import { describe, expect, it } from 'vitest';
import type { XtreamCategory } from '../xtream/types';
import { sortCategoriesCountryFirst } from './catalog-sort';
import { isTopHundredCategory, popularityRank, UNRANKED } from './catalog-popularity';

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

/**
 * Popularity ranking (`catalog-popularity.ts`). A provider's category order
 * is whatever its panel stored, so the services a viewer actually opens sat
 * scattered among long-tail entries — the "seemingly random list" this
 * replaces.
 */
describe('popularity ordering', () => {
    const messy: XtreamCategory[] = [
        { id: 'a', name: 'Turks nu te zien' },
        { id: 'b', name: 'NL | VIAPLAY' },
        { id: 'c', name: 'NL | DISNEY+' },
        { id: 'd', name: 'Bollywood 2019' },
        { id: 'e', name: 'NL | NETFLIX' },
        { id: 'f', name: 'NL | Apple TV+' },
        { id: 'g', name: 'NL | AMAZON PRIME VIDEO' },
    ];

    it('puts the named services first, in weight order', () => {
        const sorted = sortCategoriesCountryFirst(messy, 'NL');
        expect(sorted.slice(0, 5).map((c) => c.id)).toEqual(['e', 'g', 'f', 'c', 'b']);
    });

    it('keeps everything else after them, in its original relative order', () => {
        const sorted = sortCategoriesCountryFirst(messy, 'NL');
        expect(sorted.slice(5).map((c) => c.id)).toEqual(['a', 'd']);
    });

    it('matches a service however the provider punctuated it', () => {
        expect(popularityRank('DISNEY+')).toBe(popularityRank('Disney Plus'));
        expect(popularityRank('┃NL┃ NETFLIX | 4K')).toBe(popularityRank('netflix'));
        expect(popularityRank('Apple TV+')).toBe(popularityRank('appletv'));
    });

    it('leaves an unknown category unranked rather than guessing', () => {
        expect(popularityRank('Turks nu te zien')).toBe(UNRANKED);
        expect(popularityRank('')).toBe(UNRANKED);
    });

    it('still sorts by country among unranked categories', () => {
        const mixed: XtreamCategory[] = [
            { id: '1', name: 'FR | FILMS' },
            { id: '2', name: 'DE | FILME' },
            { id: '3', name: 'NL | NETFLIX' },
        ];
        expect(sortCategoriesCountryFirst(mixed, 'DE').map((c) => c.id)).toEqual(['3', '2', '1']);
    });
});

/**
 * "Top 100" is what a viewer opens to see what is worth watching, and it
 * names no service — so without its own key the popularity table leaves it
 * in the long tail. The rule is `isTopHundredCategory()`'s: the normalized
 * name *contains* the token, anywhere in it.
 */
describe('"Top 100" leads the ordering', () => {
    it('matches the shapes a panel actually ships, and nothing that merely looks like them', () => {
        expect(isTopHundredCategory('Top 100')).toBe(true);
        expect(isTopHundredCategory('TOP 100')).toBe(true);
        expect(isTopHundredCategory('┃NL┃ Top 100 Films')).toBe(true);
        expect(isTopHundredCategory('Top100')).toBe(true);
        expect(isTopHundredCategory('Top 1000')).toBe(false);
        expect(isTopHundredCategory('Stop 100')).toBe(false);
        expect(isTopHundredCategory('Top 50')).toBe(false);
        expect(isTopHundredCategory('')).toBe(false);
    });

    it('puts it first even ahead of a named service, and keeps multiple matches in provider order', () => {
        const withTop: XtreamCategory[] = [
            { id: 'a', name: 'Turks nu te zien' },
            { id: 'b', name: 'NL | NETFLIX' },
            { id: 'c', name: 'NL | TOP 100 SERIES' },
            { id: 'd', name: 'FR | FILMS' },
            { id: 'e', name: 'Top 100' },
        ];
        expect(sortCategoriesCountryFirst(withTop, 'NL').map((c) => c.id)).toEqual(['c', 'e', 'b', 'a', 'd']);
    });

    it('leaves the rest of the order alone when the provider ships no Top 100', () => {
        const none: XtreamCategory[] = [
            { id: 'a', name: 'Turks nu te zien' },
            { id: 'b', name: 'NL | NETFLIX' },
        ];
        expect(sortCategoriesCountryFirst(none, 'NL').map((c) => c.id)).toEqual(['b', 'a']);
    });
});
