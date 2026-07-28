import { appState, getPathObj, resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetPersistForTests } from './persist';
import {
    initSettingsState,
    SETTINGS_DEFAULTS,
    SETTINGS_NAV_MOVIES,
    SETTINGS_NAV_SERIES,
} from './settings';
import { toggleSetting } from './settings.actions';
import { registerUiSelectors } from './ui.selectors';
import { get } from './typed';

/**
 * Movies/Series rail visibility (Phase 21 follow-up) — mirrors the existing
 * `settings.nav.radio`/`rail.radio.visible` mechanism exactly: the same
 * `settings/toggle` allowlist and the same `RAIL_TOGGLES` loop
 * (`ui.selectors.ts`), just two more entries.
 */
describe('settings.nav.movies / settings.nav.series', () => {
    afterEach(() => {
        resetPersistForTests();
        resetState();
    });

    it('default to visible (on)', () => {
        expect(SETTINGS_DEFAULTS.nav.movies).toBe(true);
        expect(SETTINGS_DEFAULTS.nav.series).toBe(true);
    });

    it('settings/toggle flips and persists nav.movies/nav.series via the existing generic toggle', () => {
        initSettingsState();
        tick();
        toggleSetting('nav.movies');
        tick();
        expect(get<boolean>(SETTINGS_NAV_MOVIES)).toBe(false);

        toggleSetting('nav.series');
        tick();
        expect(get<boolean>(SETTINGS_NAV_SERIES)).toBe(false);
    });
});

describe('rail.movies.visible / rail.series.visible computeds', () => {
    beforeAll(() => {
        registerUiSelectors();
    });

    afterEach(() => {
        resetState();
    });

    function railVisible(name: 'movies' | 'series'): boolean | undefined {
        return (appState['rail'] as Record<string, { visible?: boolean } | undefined> | undefined)?.[name]?.visible;
    }

    it('is true by default (setting on)', () => {
        setValue(SETTINGS_NAV_MOVIES, true);
        setValue(SETTINGS_NAV_SERIES, true);
        tick();
        expect(railVisible('movies')).toBe(true);
        expect(railVisible('series')).toBe(true);
    });

    it('turns false when the setting is switched off', () => {
        setValue(SETTINGS_NAV_MOVIES, false);
        tick();
        expect(railVisible('movies')).toBe(false);
    });

    it('a hidden rail entry still shows while its own view is the active one', () => {
        setValue(SETTINGS_NAV_SERIES, false);
        setValue('ui.activeView', 'series');
        tick();
        expect(railVisible('series')).toBe(true);

        setValue('ui.activeView', 'live');
        tick();
        expect(railVisible('series')).toBe(false);
    });

    it('does not affect the existing rail toggles', () => {
        setValue(SETTINGS_NAV_MOVIES, false);
        tick();
        expect(getPathObj<boolean>(appState, 'rail.radio.visible')).not.toBe(false);
    });
});
