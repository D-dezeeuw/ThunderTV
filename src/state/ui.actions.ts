import { defineFn, refs, setValue, type State } from 'spektrum';
import { getPlatform } from '../core/platform';
import type { Density } from '../ui/density';
import { persist } from './persist';
import { applyFontSize, applyTheme } from './theme';
import {
    UI_DENSITY,
    UI_FONT_SIZE,
    UI_SETTINGS_OPEN,
    UI_STORAGE_NOTICE_DISMISSED,
    UI_THEME,
    type FontSize,
    type ThemePreference,
} from './ui';

/**
 * Every UI mutation the shell wires to `data-action`/`data-fn`, migrated
 * here from the Phase 02/04 files that originally registered them
 * (`src/ui/density.ts`, `src/app/settings-panel.ts`, `src/app/shell.ts`,
 * `src/ui/storage-notice.ts`) as part of Phase 05's action-layer
 * consolidation (Feature 05.2.1: actions live beside their owning module).
 * `index.html`'s `data-fn` attributes were updated to the renamed,
 * module-prefixed action names in the same commit.
 */
export function registerUiActions(): void {
    registerNavigateAction();
    registerDensityAction();
    registerThemeAction();
    registerFontSizeAction();
    registerSettingsPanelActions();
    registerStorageNoticeAction();
}

function registerNavigateAction(): void {
    defineFn('ui/navigate', (el) => {
        const view = el.dataset['view'];
        if (!view) return;
        location.hash = `#/${view}`;
    });
}

function isDensity(value: string): value is Density {
    return value === 'compact' || value === 'comfortable';
}

function registerDensityAction(): void {
    defineFn('ui/setDensity', (el) => {
        const value = el.dataset['density'];
        if (!value || !isDensity(value)) return;
        // <html>'s :data-density binding (index.html) picks this up and
        // tokens.css retargets --row-h/--row-pad-x/--logo-box — see
        // ui/density.ts's rowHeight() for the Phase 08 windowing mapping.
        setValue(UI_DENSITY, value);
        persist(UI_DENSITY);
    });
}

function isThemePreference(value: string): value is ThemePreference {
    return value === 'auto' || value === 'dark' || value === 'light';
}

/** Same `data-*` button-group shape as ui/setDensity above; the root
    attribute is written by applyTheme() rather than an `<html>` binding —
    src/state/theme.ts explains why. */
function registerThemeAction(): void {
    defineFn('ui/setTheme', (el) => {
        const value = el.dataset['theme'];
        if (!value || !isThemePreference(value)) return;
        setValue(UI_THEME, value);
        persist(UI_THEME);
        applyTheme(value);
    });
}

function isFontSize(value: string): value is FontSize {
    return value === 'small' || value === 'default' || value === 'large' || value === 'xlarge';
}

function registerFontSizeAction(): void {
    defineFn('ui/setFontSize', (el) => {
        const value = el.dataset['fontSize'];
        if (!value || !isFontSize(value)) return;
        setValue(UI_FONT_SIZE, value);
        persist(UI_FONT_SIZE);
        applyFontSize(value);
    });
}

function isSettingsOpen(state: State): boolean {
    return (state as { ui?: { settingsOpen?: boolean } }).ui?.settingsOpen ?? false;
}

let lastFocusedBeforeOpen: HTMLElement | null = null;

/** Double-rAF: `ui.settingsOpen`'s DOM effect (the `data-if` display flip) applies on Spektrum's next tick, so focusing immediately after `setValue` would target a still-hidden, unfocusable element. Two frames reliably lands after that tick. */
function focusAfterOpen(): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (refs['settingsPanel'] as HTMLElement | undefined)?.focus();
        });
    });
}

function registerSettingsPanelActions(): void {
    defineFn('ui/toggleSettings', (_el, state) => {
        const opening = !isSettingsOpen(state);
        if (opening) lastFocusedBeforeOpen = document.activeElement as HTMLElement | null;
        setValue(UI_SETTINGS_OPEN, opening);
        if (opening) focusAfterOpen();
    });

    defineFn('ui/closeSettings', (_el, state) => {
        if (!isSettingsOpen(state)) return;
        setValue(UI_SETTINGS_OPEN, false);
        lastFocusedBeforeOpen?.focus();
        lastFocusedBeforeOpen = null;
    });
}

/**
 * Persists the dismissal unconditionally through the generic bridge
 * (`persist()`), regardless of tier — a simplification Phase 05 enables
 * over the Phase 04 original: writing via `storage.set()` on the `none`
 * tier already "succeeds" but doesn't survive a reload by construction, so
 * the old tier-conditional check was redundant, not protective.
 */
function registerStorageNoticeAction(): void {
    defineFn('ui/dismissStorageNotice', () => {
        setValue(UI_STORAGE_NOTICE_DISMISSED, true);
        persist(UI_STORAGE_NOTICE_DISMISSED);
    });
}

/** Wired as the tier controller's `onDemote` callback (Feature 04.7.5/04.8.4) — republishes the live tier and un-dismisses the notice. Not a `defineFn` action: nothing user-triggered causes it (a sanctioned system publisher, Feature 05.2.4). */
export function handleStorageDemotion(_from: string, to: string): void {
    setValue('storage.tier', to);
    setValue(UI_STORAGE_NOTICE_DISMISSED, false);
    setValue('platform.capabilities', getPlatform().capabilities);
}
