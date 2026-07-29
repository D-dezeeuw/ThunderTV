import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFontSize, applyTheme, initAppearance, resolveTheme } from './theme';
import { UI_FONT_SIZE, UI_THEME } from './ui';

/**
 * Feature 22.5.10: the root-attribute swap and the boot-order pre-paint
 * application. jsdom has no matchMedia and does not resolve custom
 * properties through getComputedStyle — both paths are stubbed where a
 * test needs them and guarded in theme.ts where it doesn't.
 */

type SchemeListener = (ev: { matches: boolean }) => void;

function stubMatchMedia(matchesLight: boolean): { listeners: SchemeListener[] } {
    const captured: SchemeListener[] = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('light') ? matchesLight : !matchesLight,
        addEventListener: (_type: string, listener: SchemeListener) => {
            captured.push(listener);
        },
    }));
    return { listeners: captured };
}

afterEach(() => {
    resetState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['fontSize'];
    document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('resolveTheme', () => {
    it("follows the system only when the preference is 'auto'", () => {
        expect(resolveTheme('auto', true)).toBe('light');
        expect(resolveTheme('auto', false)).toBe('dark');
    });

    it('an explicit choice wins regardless of the system scheme', () => {
        expect(resolveTheme('dark', true)).toBe('dark');
        expect(resolveTheme('light', false)).toBe('light');
    });
});

describe('applyTheme', () => {
    it('writes the resolved theme to <html data-theme>', () => {
        applyTheme('light');
        expect(document.documentElement.dataset['theme']).toBe('light');
        applyTheme('dark');
        expect(document.documentElement.dataset['theme']).toBe('dark');
    });

    it("re-syncs the theme-color meta to the theme's surface token", () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('content', '#141824');
        document.head.appendChild(meta);
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: () => '#eef0f5',
        } as unknown as CSSStyleDeclaration);

        applyTheme('light');
        expect(meta.getAttribute('content')).toBe('#eef0f5');
    });

    it('leaves the meta alone when the surface token cannot be resolved (jsdom)', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('content', '#141824');
        document.head.appendChild(meta);

        applyTheme('light');
        expect(meta.getAttribute('content')).toBe('#141824');
    });
});

describe('initAppearance (boot pre-paint)', () => {
    it('applies the rehydrated theme and text size without any bindDOM()', () => {
        setValue(UI_THEME, 'light');
        setValue(UI_FONT_SIZE, 'large');
        tick();
        initAppearance();
        expect(document.documentElement.dataset['theme']).toBe('light');
        expect(document.documentElement.dataset['fontSize']).toBe('large');
    });

    it('falls back to the dark/default seeds when nothing was rehydrated', () => {
        initAppearance();
        expect(document.documentElement.dataset['theme']).toBe('dark');
        expect(document.documentElement.dataset['fontSize']).toBe('default');
    });

    it("re-resolves a system scheme flip only while the preference is 'auto'", () => {
        const { listeners } = stubMatchMedia(false);
        setValue(UI_THEME, 'auto');
        tick();
        initAppearance();
        expect(document.documentElement.dataset['theme']).toBe('dark');

        // The OS flips to light; the stub now reports light on re-query.
        stubMatchMedia(true);
        listeners.forEach((fire) => fire({ matches: true }));
        expect(document.documentElement.dataset['theme']).toBe('light');

        // An explicit choice de-arms the listener's effect.
        setValue(UI_THEME, 'dark');
        tick();
        applyTheme('dark');
        listeners.forEach((fire) => fire({ matches: true }));
        expect(document.documentElement.dataset['theme']).toBe('dark');
    });
});

describe('applyFontSize', () => {
    it('writes the step to <html data-font-size> and never touches row geometry tokens', () => {
        applyFontSize('xlarge');
        expect(document.documentElement.dataset['fontSize']).toBe('xlarge');
        // Row geometry stays density's alone (src/ui/density.ts) — the
        // attribute this writes only retargets --text-* in tokens.css.
        expect(document.documentElement.dataset['density']).toBeUndefined();
    });
});
