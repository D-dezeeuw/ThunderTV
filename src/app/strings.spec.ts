import { describe, expect, it } from 'vitest';
import { de } from './strings.de';
import { en } from './strings.en';
import { nl } from './strings.nl';
import { isLocale, loadStrings, LOCALES } from './strings';

/**
 * The maintainability guarantee this module exists for: `nl`/`de` must
 * never silently drift out of sync with `en` as new strings get added.
 * Walks every nested key path in `en` (the baseline) and asserts `nl`/`de`
 * carry the exact same shape — same keys, same nesting, no extras, no
 * missing entries, and no leaf left as a non-string (a stray object/array
 * mismatch is exactly the kind of drift this must catch).
 */
function collectPaths(obj: unknown, prefix = ''): string[] {
    if (obj === null || typeof obj !== 'object') return [prefix];
    const paths: string[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        paths.push(...collectPaths(value, path));
    }
    return paths;
}

const enPaths = collectPaths(en).sort();

describe('strings: locale key-set parity', () => {
    it('en has a non-trivial number of leaf strings (sanity check the walker itself works)', () => {
        expect(enPaths.length).toBeGreaterThan(100);
    });

    it('nl has exactly the same leaf key set as en — no missing, no extra keys', () => {
        expect(collectPaths(nl).sort()).toEqual(enPaths);
    });

    it('de has exactly the same leaf key set as en — no missing, no extra keys', () => {
        expect(collectPaths(de).sort()).toEqual(enPaths);
    });

    it('every leaf in nl/de is a non-empty string — no placeholder/blank translations', () => {
        for (const path of enPaths) {
            const nlValue = path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], nl);
            const deValue = path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], de);
            expect(typeof nlValue, `nl.${path}`).toBe('string');
            expect((nlValue as string).length, `nl.${path} is empty`).toBeGreaterThan(0);
            expect(typeof deValue, `de.${path}`).toBe('string');
            expect((deValue as string).length, `de.${path} is empty`).toBeGreaterThan(0);
        }
    });
});

describe('loadStrings()/isLocale()', () => {
    it('LOCALES lists exactly en/nl/de', () => {
        expect(LOCALES).toEqual(['en', 'nl', 'de']);
    });

    it('loadStrings() resolves each locale to its own dictionary', async () => {
        // en is the eagerly-imported baseline; nl/de arrive as their own
        // lazily-imported chunks (strings.ts's module comment) — this proves
        // the dynamic path returns the same object the static import does.
        expect(await loadStrings('en')).toBe(en);
        expect(await loadStrings('nl')).toBe(nl);
        expect(await loadStrings('de')).toBe(de);
    });

    it('isLocale() accepts exactly the three locales', () => {
        for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
        expect(isLocale('fr')).toBe(false);
        expect(isLocale(undefined)).toBe(false);
        expect(isLocale(2)).toBe(false);
    });
});
