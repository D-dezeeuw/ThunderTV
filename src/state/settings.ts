import { setValue } from 'spektrum';

export const SETTINGS_PROXY_TEMPLATE = 'settings.proxyTemplate';
/** Feature 07.8.3 validation feedback — transient, never persisted. */
export const SETTINGS_PROXY_ERROR = 'settings.proxyError';
/** Feature 07.8.3 success feedback — transient, never persisted; cleared the moment the field is edited again. */
export const SETTINGS_PROXY_SAVED = 'settings.proxySaved';

/**
 * Mirrors the stored settings blob (masterplan §6.3's `settings` key
 * family). `proxyTemplate` is the only persisted field — density lives
 * under `ui.density` (kept there for continuity with Phase 02 rather than
 * renamed here, see `state/README.md`'s "Existing-key decisions" section)
 * and playback prefs don't exist yet. `proxyError`/`proxySaved` are
 * transient validation feedback (Feature 07.8.1/07.8.3), written by
 * `settings.actions.ts`'s `settings/saveProxyTemplate`. Phase 22 builds
 * the rest of the Settings UI; the Streaming section is real starting here.
 */
export interface SettingsState {
    proxyTemplate: string | null;
    proxyError: string | null;
    proxySaved: boolean;
}

export const SETTINGS_DEFAULTS: SettingsState = {
    proxyTemplate: null,
    proxyError: null,
    proxySaved: false,
};

export function initSettingsState(): void {
    setValue(SETTINGS_PROXY_TEMPLATE, SETTINGS_DEFAULTS.proxyTemplate);
    setValue(SETTINGS_PROXY_ERROR, SETTINGS_DEFAULTS.proxyError);
    setValue(SETTINGS_PROXY_SAVED, SETTINGS_DEFAULTS.proxySaved);
}
