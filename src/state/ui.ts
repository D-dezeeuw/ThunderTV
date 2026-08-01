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
 * The single screen-reader announcement channel (Feature 25.8.5).
 *
 * **Why a dedicated key rather than `aria-live` on each notice.** The
 * existing notices are all `data-if`-toggled, and Spektrum's `data-if` sets
 * `display: none` rather than detaching — so a live region on one of them is
 * present-but-hidden at load, and whether toggling it back announces at all
 * is inconsistent across screen readers. A region that is *always* in the
 * accessibility tree and only ever has its text replaced is the shape that
 * announces reliably, exactly once, everywhere.
 *
 * Assistive tech only. Nothing renders this visibly — the visual notices
 * already exist and are unchanged; this is the parallel channel for people
 * who cannot see them.
 */
export const UI_ANNOUNCEMENT = 'ui.announcement';

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
    announcement: string;
}

export const UI_DEFAULTS: UiState = {
    activeView: DEFAULT_ROUTE,
    density: 'comfortable',
    theme: 'dark',
    fontSize: 'default',
    settingsOpen: false,
    storageNoticeDismissed: false,
    announcement: '',
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
    setValue(UI_ANNOUNCEMENT, UI_DEFAULTS.announcement);
}

/** Diagnostics-only seeding (Feature 03.8.6/04.2.7) — called once from `bootstrap()` right after `setPlatform()`, before `initState()`'s module defaults. */
export function seedPlatformDiagnostics(name: string, capabilities: Capabilities, storageTier: string): void {
    setValue(PLATFORM_NAME, name);
    setValue(PLATFORM_CAPABILITIES, capabilities);
    setValue(STORAGE_TIER, storageTier);
}
