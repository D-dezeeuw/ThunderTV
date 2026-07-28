import { describe, expect, it } from 'vitest';
import { resolveSubtitleLanguage } from './subtitle-language';

describe('resolveSubtitleLanguage()', () => {
    it('passes "off" straight through regardless of country', () => {
        expect(resolveSubtitleLanguage('off', 'NL')).toBe('off');
        expect(resolveSubtitleLanguage('off', '')).toBe('off');
    });

    it('passes an explicit language code straight through, ignoring country', () => {
        expect(resolveSubtitleLanguage('ja', 'NL')).toBe('ja');
    });

    it.each([
        ['NL', 'nl'],
        ['DE', 'de'],
        ['FR', 'fr'],
        ['BE', 'nl'],
        ['UK', 'en'],
        ['US', 'en'],
        ['IE', 'en'],
        ['ES', 'es'],
        ['IT', 'it'],
        ['PL', 'pl'],
        ['PT', 'pt'],
        ['TR', 'tr'],
        ['GR', 'el'],
        ['RO', 'ro'],
        ['SE', 'sv'],
        ['NO', 'no'],
        ['DK', 'da'],
        ['FI', 'fi'],
    ])('maps auto + %s -> %s', (country, expected) => {
        expect(resolveSubtitleLanguage('auto', country)).toBe(expected);
    });

    it('is case-insensitive on the country code', () => {
        expect(resolveSubtitleLanguage('auto', 'de')).toBe('de');
    });

    it('falls back to en for an unknown or empty country', () => {
        expect(resolveSubtitleLanguage('auto', 'ZZ')).toBe('en');
        expect(resolveSubtitleLanguage('auto', '')).toBe('en');
    });
});
