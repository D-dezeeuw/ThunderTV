import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { flushNow, pendingKeys, resetPersistForTests } from './persist';
import { setAudioLanguage, setSubtitleLanguage } from './settings.actions';
import { initSettingsState, SETTINGS_AUDIO_LANGUAGE, SETTINGS_DEFAULTS, SETTINGS_SUBTITLE_LANGUAGE } from './settings';
import { get } from './typed';

/**
 * `settings/setAudioLanguage`/`settings/setSubtitleLanguage` (Phase 21) —
 * same uncontrolled-`<select>`, save-immediately pattern as `setLiveCountry()`.
 */
describe('audio/subtitle language settings', () => {
    afterEach(() => {
        resetPersistForTests();
        resetState();
    });

    it('default to en / auto', () => {
        expect(SETTINGS_DEFAULTS.audioLanguage).toBe('en');
        expect(SETTINGS_DEFAULTS.subtitleLanguage).toBe('auto');
    });

    it('setAudioLanguage() lower-cases and persists', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            setAudioLanguage('NL');
            tick();

            expect(get<string>(SETTINGS_AUDIO_LANGUAGE)).toBe('nl');
            expect(pendingKeys()).toContain(SETTINGS_AUDIO_LANGUAGE);
        });
    });

    it('setAudioLanguage() ignores a blank value', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            setAudioLanguage('fr');
            tick();
            setAudioLanguage('   ');
            tick();

            expect(get<string>(SETTINGS_AUDIO_LANGUAGE)).toBe('fr');
        });
    });

    it('setSubtitleLanguage() accepts auto/off/a language code and persists', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();

            setSubtitleLanguage('off');
            tick();
            expect(get<string>(SETTINGS_SUBTITLE_LANGUAGE)).toBe('off');

            setSubtitleLanguage('DE');
            tick();
            expect(get<string>(SETTINGS_SUBTITLE_LANGUAGE)).toBe('de');
            expect(pendingKeys()).toContain(SETTINGS_SUBTITLE_LANGUAGE);

            setSubtitleLanguage('auto');
            tick();
            expect(get<string>(SETTINGS_SUBTITLE_LANGUAGE)).toBe('auto');
        });
    });

    it('round-trips both settings through the persistence bridge as versioned envelopes', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initSettingsState();
            setAudioLanguage('nl');
            setSubtitleLanguage('de');
            tick();
            await flushNow();

            expect(await storage.get(SETTINGS_AUDIO_LANGUAGE)).toEqual({ v: 1, data: 'nl' });
            expect(await storage.get(SETTINGS_SUBTITLE_LANGUAGE)).toEqual({ v: 1, data: 'de' });
        });
    });
});
