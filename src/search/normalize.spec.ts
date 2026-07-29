import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from './normalize';

describe('normalizeForSearch', () => {
    it('lowercases', () => {
        expect(normalizeForSearch('NPO 1 HD')).toBe('npo 1 hd');
    });

    it('folds diacritics via NFD decomposition', () => {
        expect(normalizeForSearch('café')).toBe('cafe');
        expect(normalizeForSearch('König')).toBe('konig');
        expect(normalizeForSearch('König der Löwen')).toBe('konig der lowen');
    });

    it('strips box-drawing and separator decoration from real channel names', () => {
        expect(normalizeForSearch('┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ')).toBe('nl npo 1 hd');
        expect(normalizeForSearch('┃USA┃ 24/7 | MOVIES')).toBe('usa 24 7 movies');
    });

    it('treats superscript modifier letters as decoration, like box-drawing glyphs', () => {
        // ⏺ʳᵉᶜ pairs the record glyph with superscript r/e/c — both are
        // typographic decoration on these lists (see name-parse.ts's
        // isRecording flag for the structured version of this same
        // signal), so they collapse away entirely rather than surviving
        // as a literal "rec" word.
        expect(normalizeForSearch('ʳᵉᶜ')).toBe('');
        expect(normalizeForSearch('NPO 1ᴴᴰ')).toBe('npo 1');
    });

    it('keeps parenthesized years and quality markers as searchable words', () => {
        expect(normalizeForSearch('Avengers: Endgame (2019) 4K')).toBe('avengers endgame 2019 4k');
    });

    it('collapses runs of whitespace and punctuation to a single space', () => {
        expect(normalizeForSearch('a    b')).toBe('a b');
        expect(normalizeForSearch('a---b...c')).toBe('a b c');
    });

    it('trims leading and trailing space left by stripped decoration', () => {
        expect(normalizeForSearch('  ┃NL┃ NPO 1  ')).toBe('nl npo 1');
    });

    it('is idempotent — normalizing an already-normalized key is a no-op', () => {
        const once = normalizeForSearch('┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ');
        expect(normalizeForSearch(once)).toBe(once);
    });

    it('reduces an empty or all-decoration string to an empty key', () => {
        expect(normalizeForSearch('')).toBe('');
        expect(normalizeForSearch('┃┃⏺|||')).toBe('');
    });
});
