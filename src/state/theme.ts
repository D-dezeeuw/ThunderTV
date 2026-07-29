import { appState, getPathObj } from 'spektrum';
import { UI_DEFAULTS, UI_FONT_SIZE, UI_THEME, type FontSize, type ThemePreference } from './ui';

/**
 * Applies the appearance settings to the document root — the one place
 * `<html data-theme>` and `<html data-font-size>` are ever written.
 *
 * Deliberately imperative rather than a Spektrum `:data-theme` binding on
 * `<html>` (the `:data-density` route): the stored preference is
 * 'auto' | 'dark' | 'light' but CSS needs the *resolved* 'dark' | 'light',
 * and the boot pre-paint (masterplan 22.5.2) must run before `bindDOM()`
 * anyway — so the action, the prefers-color-scheme listener, and boot all
 * share this single mechanism instead of a binding plus a mirror key.
 *
 * DOM attribute writes are not state writes — the `setValue`-only-in-
 * src/state rule is untouched; this module living here anyway follows the
 * seedStrings() precedent.
 *
 * Known tradeoff: `rehydrateState()` awaits async storage, so a user who
 * explicitly chose light sees the dark-styled empty shell for the beat
 * before `initAppearance()` runs. Accepted for now — dark is the :root
 * default and the shell is empty at that point. If it ever grates, mirror
 * the *resolved* theme to a dedicated localStorage side-key from
 * applyTheme() and read it in a tiny inline <head> script before the
 * stylesheets.
 */

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

/** Pure resolution — 'auto' follows the system, an explicit choice wins. */
export function resolveTheme(pref: ThemePreference, systemPrefersLight: boolean): 'dark' | 'light' {
    if (pref === 'auto') return systemPrefersLight ? 'light' : 'dark';
    return pref;
}

function systemPrefersLight(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_SCHEME_QUERY).matches;
}

/**
 * Writes the resolved theme to `<html data-theme>` and re-syncs the
 * `theme-color` meta to the theme's surface token, so the browser chrome
 * (mobile address bar, PWA titlebar) follows the switch.
 */
export function applyTheme(pref: ThemePreference): void {
    const resolved = resolveTheme(pref, systemPrefersLight());
    document.documentElement.dataset['theme'] = resolved;
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
    if (surface) {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
    }
}

/** Writes the text-size step to `<html data-font-size>` — tokens.css does the rest. */
export function applyFontSize(size: FontSize): void {
    document.documentElement.dataset['fontSize'] = size;
}

/**
 * Boot pre-paint (masterplan 22.5.2): called from `bootstrap()` directly
 * after `rehydrateState()`, before `bindDOM()`, so the restored appearance
 * is on the root before anything renders. Also arms the live 'auto'
 * re-resolve — an OS scheme flip re-applies only while the stored
 * preference is 'auto' (an explicit choice keeps winning, 22.5.6).
 */
export function initAppearance(): void {
    applyTheme(getPathObj<ThemePreference>(appState, UI_THEME) ?? UI_DEFAULTS.theme);
    applyFontSize(getPathObj<FontSize>(appState, UI_FONT_SIZE) ?? UI_DEFAULTS.fontSize);
    if (typeof window.matchMedia !== 'function') return;
    window.matchMedia(LIGHT_SCHEME_QUERY).addEventListener('change', () => {
        if (getPathObj<ThemePreference>(appState, UI_THEME) === 'auto') applyTheme('auto');
    });
}
