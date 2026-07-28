import { describe, expect, it } from 'vitest';
import { cleanCatalogDisplayName } from './catalog-clean-name';

describe('cleanCatalogDisplayName()', () => {
    it('strips a leading "| XX |" category tag', () => {
        expect(cleanCatalogDisplayName('| NL | WK 2026')).toBe('WK 2026');
    });

    it('strips a leading "| XX |" tag from another category', () => {
        expect(cleanCatalogDisplayName('| NL | TOP 100')).toBe('TOP 100');
    });

    it('strips a leading tag from a title, leaving an interior same-token word untouched', () => {
        expect(cleanCatalogDisplayName('| WK | NOS FIFA WK Voetbal 2026 Finale Spanje - Argentinië + Studio')).toBe(
            'NOS FIFA WK Voetbal 2026 Finale Spanje - Argentinië + Studio',
        );
    });

    it('strips a box-drawing "┃XX┃" variant', () => {
        expect(cleanCatalogDisplayName('┃NL┃ NPO 1 HD')).toBe('NPO 1 HD');
    });

    it('strips multiple stacked tags, in any of the supported delimiter styles', () => {
        expect(cleanCatalogDisplayName('| NL | | HD | Show Name')).toBe('Show Name');
        expect(cleanCatalogDisplayName('[NL][HD]Show')).toBe('Show');
    });

    it('falls back to the original string when stripping would leave nothing', () => {
        expect(cleanCatalogDisplayName('| NL |')).toBe('| NL |');
        expect(cleanCatalogDisplayName('[NL]')).toBe('[NL]');
    });

    it('passes a clean name through untouched', () => {
        expect(cleanCatalogDisplayName('Inception (2010)')).toBe('Inception (2010)');
    });

    it('does not treat a mixed-case bracketed word as a decoration tag', () => {
        expect(cleanCatalogDisplayName('[Uncut] Director\'s Edition')).toBe('[Uncut] Director\'s Edition');
    });

    it('collapses irregular internal whitespace left after stripping', () => {
        expect(cleanCatalogDisplayName('|NL|   Extra   Spaces')).toBe('Extra Spaces');
    });
});
