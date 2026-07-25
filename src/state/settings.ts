import { setValue } from 'spektrum';

export const SETTINGS_PROXY_TEMPLATE = 'settings.proxyTemplate';

/**
 * Mirrors the stored settings blob (masterplan §6.3's `settings` key
 * family). Only `proxyTemplate` exists today — density lives under
 * `ui.density` (kept there for continuity with Phase 02 rather than
 * renamed here, see `state/README.md`'s "Existing-key decisions" section)
 * and playback prefs don't exist yet. Phase 22 builds the Settings UI that
 * actually writes this; until then it's a real, tested, persisted key with
 * no writer besides its own default.
 */
export interface SettingsState {
    proxyTemplate: string | null;
}

export const SETTINGS_DEFAULTS: SettingsState = {
    proxyTemplate: null,
};

export function initSettingsState(): void {
    setValue(SETTINGS_PROXY_TEMPLATE, SETTINGS_DEFAULTS.proxyTemplate);
}
