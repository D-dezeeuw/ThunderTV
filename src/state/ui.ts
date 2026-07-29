import { setValue } from 'spektrum';
import type { Capabilities } from '../core/platform';
import { DEFAULT_ROUTE, type Route } from '../app/router';

export const UI_ACTIVE_VIEW = 'ui.activeView';
export const UI_DENSITY = 'ui.density';
export const UI_THEME = 'ui.theme';
export const UI_FONT_SIZE = 'ui.fontSize';
export const UI_SETTINGS_OPEN = 'ui.settingsOpen';
export const UI_STORAGE_NOTICE_DISMISSED = 'ui.storageNoticeDismissed';

/**
 * Diagnostic mirrors of the platform/storage layers (Features 03.8.6,
 * 04.7.5) — documented as `ui`-owned in the registry (`state/README.md`'s
 * "Existing-key decisions") even though their key strings stay
 * unnamespaced (`platform.*`/`storage.tier`, not `ui.platform*`), to avoid
 * rippling a rename through every already-tested Phase 03/04 binding and
 * spec that reads them directly.
 */
export const PLATFORM_NAME = 'platform.name';
export const PLATFORM_CAPABILITIES = 'platform.capabilities';
export const STORAGE_TIER = 'storage.tier';

export type Density = 'compact' | 'comfortable';

/**
 * The *stored* theme preference — 'auto' resolves against
 * prefers-color-scheme at apply time (src/state/theme.ts); CSS only ever
 * sees the resolved 'dark' | 'light' on <html data-theme>. Default 'dark':
 * every existing user is on dark, and dark is tokens.css's :root default,
 * so the pre-rehydrate paint is already correct for anyone who never
 * touched the setting (masterplan 22.5.1/22.5.6 — Auto stays one tap away).
 */
export type ThemePreference = 'auto' | 'dark' | 'light';

/** Text-only size steps — retargets tokens.css's --text-*; never row geometry (that stays density's, src/ui/density.ts). */
export type FontSize = 'small' | 'default' | 'large' | 'xlarge';

export interface UiState {
    activeView: Route;
    density: Density;
    theme: ThemePreference;
    fontSize: FontSize;
    settingsOpen: boolean;
    storageNoticeDismissed: boolean;
}

export const UI_DEFAULTS: UiState = {
    activeView: DEFAULT_ROUTE,
    density: 'comfortable',
    theme: 'dark',
    fontSize: 'default',
    settingsOpen: false,
    storageNoticeDismissed: false,
};

/**
 * Seeds this module's defaults. `activeView` is deliberately **not** seeded
 * here — the router (`initRouter()`, called after `initState()`) is its
 * sole sanctioned publisher (Feature 02.4.3/05.2.4) and resolves the real
 * initial route from the URL hash; seeding a default here first would just
 * be an extra, immediately-overwritten write.
 */
export function initUiState(): void {
    setValue(UI_DENSITY, UI_DEFAULTS.density);
    setValue(UI_THEME, UI_DEFAULTS.theme);
    setValue(UI_FONT_SIZE, UI_DEFAULTS.fontSize);
    setValue(UI_SETTINGS_OPEN, UI_DEFAULTS.settingsOpen);
    setValue(UI_STORAGE_NOTICE_DISMISSED, UI_DEFAULTS.storageNoticeDismissed);
}

/** Diagnostics-only seeding (Feature 03.8.6/04.2.7) — called once from `bootstrap()` right after `setPlatform()`, before `initState()`'s module defaults. */
export function seedPlatformDiagnostics(name: string, capabilities: Capabilities, storageTier: string): void {
    setValue(PLATFORM_NAME, name);
    setValue(PLATFORM_CAPABILITIES, capabilities);
    setValue(STORAGE_TIER, storageTier);
}
