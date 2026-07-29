import { describe, expect, it } from 'vitest';
import { setValue, tick } from 'spektrum';
import { mountTemplate } from '../shared/testing/bind-dom';
import { BLANK_IMAGE } from './blank-image';
import { NON_REGISTRY_KEYS } from './registry';

/**
 * Guards the fix for a wasted `GET /undefined` on every page load.
 *
 * Spektrum applies `:src` through the DOM *property* (`img.src = value`),
 * not `setAttribute` — its null-means-remove path only covers hyphenated
 * attribute names like `aria-current`. So an `undefined` binding became the
 * literal string `"undefined"`, which the browser then fetched as a relative
 * URL. It happened once per logo-less row, even though the `<img>` is hidden
 * by its own `data-if` and a sibling placeholder draws the real fallback.
 */
describe('blankImage (:src fallback)', () => {
    it('is registered as static reference data, not application state', () => {
        expect(NON_REGISTRY_KEYS).toContain('blankImage');
    });

    it('is a self-contained data URI, so resolving it never hits the network', () => {
        expect(BLANK_IMAGE.startsWith('data:image/')).toBe(true);
    });

    it('binds the transparent pixel, not "undefined", for a row with no logo', () => {
        const mounted = mountTemplate(
            `<div data-each="probe.rows"><img data-testid="logo" :src="item.logo || blankImage" alt="" /></div>`,
        );
        setValue('probe.rows', [{ id: 'a', name: 'No logo channel' }]);
        tick();

        const img = mounted.query<HTMLImageElement>('[data-testid="logo"]');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).not.toBe('undefined');
        expect(img?.getAttribute('src')).toBe(BLANK_IMAGE);
        mounted.cleanup();
    });

    it('still binds the real logo when the row has one', () => {
        const mounted = mountTemplate(
            `<div data-each="probe.rows"><img data-testid="logo" :src="item.logo || blankImage" alt="" /></div>`,
        );
        setValue('probe.rows', [{ id: 'a', logo: 'https://example.com/a.png' }]);
        tick();

        expect(mounted.query<HTMLImageElement>('[data-testid="logo"]')?.getAttribute('src')).toBe(
            'https://example.com/a.png',
        );
        mounted.cleanup();
    });
});
