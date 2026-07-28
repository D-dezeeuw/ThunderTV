import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale, strings } from '../app/strings';
import { withFakePlatform } from '../core/platform/fake-platform';
import { setLocale } from './settings.actions';
import { initSettingsState, SETTINGS_DEFAULTS, SETTINGS_LOCALE } from './settings';
import { get } from './typed';

/**
 * `settings/setLocale` (i18n follow-up) — updates immediately on selection,
 * no Save step, exactly like `setLiveCountry()`'s uncontrolled-select
 * pattern this mirrors.
 */
describe('setLocale() (i18n)', () => {
    afterEach(async () => {
        resetState();
        // `strings` is a plain-TS module singleton (app/strings.ts), outside
        // Spektrum's resetState() — reset it too, so a locale switch here
        // never leaks into a later spec file.
        await applyLocale('en');
    });

    it('defaults to en', () => {
        expect(SETTINGS_DEFAULTS.locale).toBe('en');
    });

    it('switches settings.locale and the plain-TS strings singleton together', async () => {
        await withFakePlatform({}, async () => {
            initSettingsState();
            tick();
            expect(strings.appName).toBe('ThunderTV');
            expect(strings.rail.live).toBe('Live');

            await setLocale('nl');
            tick();

            expect(get<string>(SETTINGS_LOCALE)).toBe('nl');
            expect(strings.rail.categories).toBe('Categorieën');
        });
    });

    it('switching to de picks up German copy', async () => {
        await withFakePlatform({}, async () => {
            initSettingsState();
            await setLocale('de');
            tick();

            expect(get<string>(SETTINGS_LOCALE)).toBe('de');
            expect(strings.rail.categories).toBe('Kategorien');
        });
    });

    it('rejects an unrecognised locale — the select only ever offers en/nl/de', async () => {
        await withFakePlatform({}, async () => {
            initSettingsState();
            await setLocale('nl');
            tick();

            await setLocale('fr');
            tick();

            expect(get<string>(SETTINGS_LOCALE)).toBe('nl');
        });
    });

    it('mirrors the switch into the Spektrum "strings" state key for template bindings', async () => {
        await withFakePlatform({}, async () => {
            initSettingsState();
            await setLocale('de');
            tick();

            // Same mirror seedStrings() performs at boot — round-trips
            // through Spektrum state, not the plain-TS import.
            const spektrumStrings = get<{ rail?: { categories?: string } }>('strings');
            expect(spektrumStrings?.rail?.categories).toBe('Kategorien');
        });
    });
});
