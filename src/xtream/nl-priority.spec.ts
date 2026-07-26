import { describe, expect, it } from 'vitest';
import { isDutchCategory, sortCategoriesNlFirst } from './nl-priority';

describe('xtream/nl-priority', () => {
    it('isDutchCategory matches the common NL-prefix and country-name conventions', () => {
        expect(isDutchCategory('NL | ENTERTAINMENT')).toBe(true);
        expect(isDutchCategory('NL: SPORT')).toBe(true);
        expect(isDutchCategory('Nederland')).toBe(true);
        expect(isDutchCategory('Dutch Movies')).toBe(true);
        expect(isDutchCategory('UK | SPORTS')).toBe(false);
        // word-boundary — must not false-positive on substrings
        expect(isDutchCategory('ONLINE')).toBe(false);
        expect(isDutchCategory('ONLY MOVIES')).toBe(false);
    });

    it('sortCategoriesNlFirst moves Dutch categories to the front, preserving relative order otherwise', () => {
        const categories = [
            { id: '1', name: 'UK | SPORTS' },
            { id: '2', name: 'NL | ENTERTAINMENT' },
            { id: '3', name: 'US | MOVIES' },
            { id: '4', name: 'NL | SPORT' },
        ];
        expect(sortCategoriesNlFirst(categories).map((c) => c.id)).toEqual(['2', '4', '1', '3']);
    });

    it('sortCategoriesNlFirst is a no-op when there are no Dutch categories', () => {
        const categories = [
            { id: '1', name: 'UK | SPORTS' },
            { id: '2', name: 'US | MOVIES' },
        ];
        expect(sortCategoriesNlFirst(categories).map((c) => c.id)).toEqual(['1', '2']);
    });
});
