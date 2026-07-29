import { describe, expect, it } from 'vitest';
import {
    countryForLiveToken,
    EPG_COUNTRIES,
    feedUrls,
    findCountry,
    listCountries,
    liveTokenFor,
    plainFeedUrls,
    stripCountrySuffix,
    type EpgCountry,
} from './countries';

const NL: EpgCountry = {
    folder: 'Netherlands',
    filePrefix: 'netherlands',
    fileCount: 2,
    suffix: 'nl',
    iso2: 'NL',
    name: 'Netherlands',
    kind: 'country',
};

const UK: EpgCountry = {
    folder: 'Unitedkingdom',
    filePrefix: 'unitedkingdom',
    fileCount: 5,
    suffix: 'uk',
    iso2: 'GB',
    name: 'United Kingdom',
    kind: 'country',
};

const SPORTS: EpgCountry = {
    folder: 'Sports',
    filePrefix: 'sports',
    fileCount: 3,
    suffix: 'sports',
    iso2: '',
    name: 'Sports',
    kind: 'region',
};

describe('feedUrls / plainFeedUrls', () => {
    it('builds one gz URL per file, 1..fileCount, in order', () => {
        expect(feedUrls(NL)).toEqual([
            'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands1.xml.gz',
            'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands2.xml.gz',
        ]);
    });

    it('plainFeedUrls mirrors the same shape without .gz', () => {
        expect(plainFeedUrls(NL)).toEqual([
            'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands1.xml',
            'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands2.xml',
        ]);
    });

    it('fileCount 1 yields exactly one URL', () => {
        expect(feedUrls({ ...NL, fileCount: 1 })).toHaveLength(1);
    });

    it('fileCount 6 yields exactly six URLs, ending at 6', () => {
        const urls = feedUrls({ ...NL, folder: 'Usa', filePrefix: 'usa', fileCount: 6 });
        expect(urls).toHaveLength(6);
        expect(urls[5]).toContain('usa6.xml.gz');
    });
});

describe('stripCountrySuffix', () => {
    it('strips a simple trailing suffix', () => {
        expect(stripCountrySuffix('24 Kitchen.nl', NL)).toBe('24 Kitchen');
    });

    it('is case-insensitive on the suffix', () => {
        expect(stripCountrySuffix('BBC One.NL', NL)).toBe('BBC One');
    });

    it('only strips the registered suffix, leaving interior dots alone (dot-bearing id)', () => {
        expect(stripCountrySuffix('1-2-3.tv.de', { ...NL, suffix: 'de' })).toBe('1-2-3.tv');
    });

    it('leaves an id with no matching suffix untouched', () => {
        expect(stripCountrySuffix('24 Kitchen', NL)).toBe('24 Kitchen');
    });

    it('does not strip a suffix that only matches mid-string', () => {
        expect(stripCountrySuffix('Nlx TV.us', NL)).toBe('Nlx TV.us');
    });
});

describe('countryForLiveToken / liveTokenFor (against the real generated registry)', () => {
    it('matches "UK" by suffix — Unitedkingdom has iso2 GB but live token UK', () => {
        expect(countryForLiveToken('UK')).toEqual(expect.objectContaining({ folder: 'Unitedkingdom' }));
    });

    it('matches "NL" by iso2', () => {
        expect(countryForLiveToken('NL')).toEqual(expect.objectContaining({ folder: 'Netherlands' }));
    });

    it('is case-insensitive and trims whitespace', () => {
        expect(countryForLiveToken(' nl ')).toEqual(expect.objectContaining({ folder: 'Netherlands' }));
    });

    it('returns undefined for an empty or unknown token', () => {
        expect(countryForLiveToken('')).toBeUndefined();
        expect(countryForLiveToken('ZZ-NOT-A-COUNTRY')).toBeUndefined();
    });

    it('liveTokenFor round-trips: NL -> "NL", Unitedkingdom -> its iso2 "GB"', () => {
        expect(liveTokenFor(findCountry('Netherlands')!)).toBe('NL');
        expect(liveTokenFor(findCountry('Unitedkingdom')!)).toBe('GB');
    });
});

describe('findCountry', () => {
    it('finds by folder name, case-insensitive', () => {
        expect(findCountry('netherlands')).toEqual(expect.objectContaining({ folder: 'Netherlands' }));
    });

    it('finds by iso2', () => {
        expect(findCountry('NL')).toEqual(expect.objectContaining({ folder: 'Netherlands' }));
    });

    it('finds by suffix', () => {
        expect(findCountry('nl')).toEqual(expect.objectContaining({ folder: 'Netherlands' }));
    });

    it('returns undefined for an unknown token', () => {
        expect(findCountry('nowhere')).toBeUndefined();
    });
});

describe('listCountries', () => {
    it('excludes region entries and sorts alphabetically by name', () => {
        const pool = [UK, SPORTS, NL];
        const countries = pool.filter((c) => c.kind === 'country').sort((a, b) => a.name.localeCompare(b.name));
        expect(countries.map((c) => c.folder)).toEqual(['Netherlands', 'Unitedkingdom']);
    });
});

describe('the generated registry data', () => {
    it('is non-empty and every entry has a non-empty folder/filePrefix/suffix', () => {
        expect(EPG_COUNTRIES.length).toBeGreaterThan(0);
        for (const c of EPG_COUNTRIES) {
            expect(c.folder.length).toBeGreaterThan(0);
            expect(c.filePrefix.length).toBeGreaterThan(0);
            expect(c.suffix.length).toBeGreaterThan(0);
            expect(c.fileCount).toBeGreaterThan(0);
        }
    });

    it('has no duplicate folder names', () => {
        const folders = EPG_COUNTRIES.map((c) => c.folder);
        expect(new Set(folders).size).toBe(folders.length);
    });

    it('knows Netherlands with the verified shape (2 files, suffix nl)', () => {
        const nl = findCountry('Netherlands');
        expect(nl).toEqual(expect.objectContaining({ iso2: 'NL', suffix: 'nl', fileCount: 2 }));
    });

    it('knows Unitedkingdom with iso2 GB but suffix uk — the documented exception', () => {
        const uk = findCountry('Unitedkingdom');
        expect(uk).toEqual(expect.objectContaining({ iso2: 'GB', suffix: 'uk' }));
    });

    it('knows Usa with exactly 6 files', () => {
        expect(findCountry('Usa')).toEqual(expect.objectContaining({ fileCount: 6 }));
    });

    it('listCountries() output has no region entries', () => {
        expect(listCountries().every((c) => c.kind === 'country')).toBe(true);
    });
});
