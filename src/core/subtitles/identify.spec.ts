import { describe, expect, it } from 'vitest';
import { asImdbId, contentIdFor, normalizeTitle, parseYear, rankTitleCandidates, type TitleCandidate } from './identify';
import { orderByLanguage, parseSubtitleList, parseTitleCandidates } from './providers';
import { toIso6391 } from './languages';

/**
 * The identification ladder is the only part of this feature that can be
 * *confidently wrong* — a bad rank returns real subtitles for the wrong film,
 * which reads as "the subtitles are out of sync" rather than as a failure.
 * These cover the rungs and the wire shapes; the network half is one `get()`
 * per rung and has nothing to get wrong that a typecheck doesn't already see.
 */
describe('rankTitleCandidates', () => {
    const candidates: TitleCandidate[] = [
        { imdbId: 'tt0083658', name: 'Blade Runner', year: 1982 },
        { imdbId: 'tt1856101', name: 'Blade Runner 2049', year: 2017 },
    ];

    it('prefers the exact title over a longer one that merely starts with it', () => {
        const [best] = rankTitleCandidates(candidates, { title: 'Blade Runner' });
        expect(best?.candidate.imdbId).toBe('tt0083658');
    });

    it('lets the year override title order — a remake must not steal the original', () => {
        const [best] = rankTitleCandidates(candidates, { title: 'Blade Runner 2049', year: '2017' });
        expect(best?.candidate.imdbId).toBe('tt1856101');
        expect(best?.confident).toBe(true);
    });

    it('is not confident when the year disagrees, so the UI can say "best match"', () => {
        const ranked = rankTitleCandidates([{ imdbId: 'tt0000001', name: 'Dune', year: 1984 }], { title: 'Dune', year: 2021 });
        expect(ranked[0]?.confident).toBe(false);
    });

    it('drops candidates with no meaningful overlap rather than offering the wrong film', () => {
        expect(rankTitleCandidates([{ imdbId: 'tt0000002', name: 'The Godfather', year: 1972 }], { title: 'Blade Runner' })).toEqual([]);
    });

    it('sees through the decoration a panel bakes into a title', () => {
        expect(normalizeTitle('The Matrix (1999) 1080p WEB-DL x264')).toBe('matrix');
        expect(normalizeTitle('Amélie')).toBe('amelie');
        // Leading-article and ampersand folding, so both spellings meet.
        expect(normalizeTitle('Sex & the City')).toBe('sex and the city');
    });
});

describe('provider metadata', () => {
    it('takes an imdb id only when it really is one', () => {
        expect(asImdbId('tt0111161')).toBe('tt0111161');
        expect(asImdbId('0111161')).toBeNull();
        expect(asImdbId(278)).toBeNull();
        expect(asImdbId('')).toBeNull();
    });

    it('reads a year out of whatever shape the panel sent', () => {
        expect(parseYear('2019-04-26')).toBe(2019);
        expect(parseYear('26.04.2019')).toBe(2019);
        expect(parseYear(1994)).toBe(1994);
        expect(parseYear('')).toBeNull();
    });

    it('addresses an episode as tt…:season:episode, a film as the bare id', () => {
        expect(contentIdFor('tt0944947')).toBe('tt0944947');
        expect(contentIdFor('tt0944947', { season: 1, episode: 2 })).toBe('tt0944947:1:2');
    });
});

describe('wire shapes', () => {
    it('reads Cinemeta metas, taking the leading year out of releaseInfo', () => {
        const parsed = parseTitleCandidates({
            metas: [
                { id: 'tt0903747', name: 'Breaking Bad', releaseInfo: '2008-2013', year: null },
                { id: 'kitsu:123', name: 'Not an imdb row' },
                { id: 'tt0111161', imdb_id: 'tt0111161', name: 'The Shawshank Redemption', releaseInfo: '1994' },
            ],
        });
        expect(parsed).toEqual([
            { imdbId: 'tt0903747', name: 'Breaking Bad', year: 2008 },
            { imdbId: 'tt0111161', name: 'The Shawshank Redemption', year: 1994 },
        ]);
    });

    it('folds both ISO 639-2 variants the service mixes in one response', () => {
        // A single real response carries `cze` (639-2/B) beside `ron` and
        // `ell` (639-2/T); a table keyed on one variant loses languages.
        expect(['cze', 'ces'].map(toIso6391)).toEqual(['cs', 'cs']);
        expect(['fre', 'fra'].map(toIso6391)).toEqual(['fr', 'fr']);
        expect(['gre', 'ell'].map(toIso6391)).toEqual(['el', 'el']);
        // OpenSubtitles' own non-standard Brazilian Portuguese.
        expect(toIso6391('pob')).toBe('pt');
        // Unknown tags keep their own code rather than becoming ''.
        expect(toIso6391('xyz')).toBe('xyz');
    });

    it('drops url-less rows and repeated ids so a menu row resolves to one file', () => {
        const parsed = parseSubtitleList({
            subtitles: [
                { id: '1', url: 'https://s/1', lang: 'dut' },
                { id: '1', url: 'https://s/1-again', lang: 'dut' },
                { id: '2', lang: 'eng' },
                { id: '3', url: 'https://s/3', lang: 'eng' },
            ],
        });
        expect(parsed).toEqual([
            { id: '1', url: 'https://s/1', lang: 'nl' },
            { id: '3', url: 'https://s/3', lang: 'en' },
        ]);
    });

    it('sorts the preferred language first but keeps the rest — English beats "none found"', () => {
        const rows = [
            { id: 'a', url: 'u', lang: 'en' },
            { id: 'b', url: 'u', lang: 'nl' },
            { id: 'c', url: 'u', lang: 'en' },
        ];
        expect(orderByLanguage(rows, 'nl', 10).map((row) => row.id)).toEqual(['b', 'a', 'c']);
        expect(orderByLanguage(rows, 'nl', 2).map((row) => row.id)).toEqual(['b', 'a']);
    });
});
