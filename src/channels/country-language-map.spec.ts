import { describe, expect, it } from 'vitest';
import { COUNTRY_LANGUAGE_MAP, findCountryByPrefix, matchesCountry } from './country-language-map';

describe('channels/country-language-map', () => {
    it('findCountryByPrefix resolves app codes case-insensitively', () => {
        expect(findCountryByPrefix('NL')?.code).toBe('NL');
        expect(findCountryByPrefix('nl')?.code).toBe('NL');
        expect(findCountryByPrefix('DE')?.code).toBe('DE');
        expect(findCountryByPrefix('UK')?.isoCode).toBe('GB');
    });

    it('findCountryByPrefix resolves real-playlist alias tokens to their canonical code', () => {
        expect(findCountryByPrefix('USA')?.code).toBe('US');
        expect(findCountryByPrefix('CA EN')?.code).toBe('CA');
        expect(findCountryByPrefix('CA FR')?.code).toBe('CA');
        expect(findCountryByPrefix('SOM')?.code).toBe('SO');
    });

    it('findCountryByPrefix returns undefined for unknown/non-country tokens', () => {
        expect(findCountryByPrefix('AR')).toBeUndefined();
        expect(findCountryByPrefix('EXYU')).toBeUndefined();
        expect(findCountryByPrefix('PPV')).toBeUndefined();
    });

    it('matchesCountry matches the code, country-name synonyms, and language-name synonyms', () => {
        // Dutch — same cases nl-priority.spec.ts covers, now via the shared table.
        expect(matchesCountry('NL | ENTERTAINMENT', 'NL')).toBe(true);
        expect(matchesCountry('Nederland', 'NL')).toBe(true);
        expect(matchesCountry('Dutch Movies', 'NL')).toBe(true);
        expect(matchesCountry('Holland Sport', 'NL')).toBe(true);
        expect(matchesCountry('UK | SPORTS', 'NL')).toBe(false);

        // German — the new case this generalization is for.
        expect(matchesCountry('DE | FILME', 'DE')).toBe(true);
        expect(matchesCountry('Deutschland', 'DE')).toBe(true);
        expect(matchesCountry('German Movies', 'DE')).toBe(true);
        expect(matchesCountry('NL | ENTERTAINMENT', 'DE')).toBe(false);
    });

    it('matchesCountry avoids word-boundary false positives', () => {
        expect(matchesCountry('ONLINE', 'NL')).toBe(false);
        expect(matchesCountry('ONLY MOVIES', 'NL')).toBe(false);
    });

    it('matchesCountry returns false for an unknown code', () => {
        expect(matchesCountry('Anything', 'ZZ')).toBe(false);
    });

    it('covers the existing Settings "Live filter country" shortlist', () => {
        for (const code of ['NL', 'BE', 'DE', 'UK', 'FR', 'ES', 'US']) {
            expect(findCountryByPrefix(code)).toBeDefined();
        }
    });

    it('every entry has a unique code and non-empty synonym lists', () => {
        const codes = new Set(COUNTRY_LANGUAGE_MAP.map((entry) => entry.code));
        expect(codes.size).toBe(COUNTRY_LANGUAGE_MAP.length);
        for (const entry of COUNTRY_LANGUAGE_MAP) {
            expect(entry.countryNames.length).toBeGreaterThan(0);
            expect(entry.languageNames.length).toBeGreaterThan(0);
        }
    });
});
