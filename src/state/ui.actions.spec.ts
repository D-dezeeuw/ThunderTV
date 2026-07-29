import { appState, bindDOM, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerUiActions } from './ui.actions';

function settingsOpen(): boolean | undefined {
    return (appState['ui'] as { settingsOpen?: boolean } | undefined)?.settingsOpen;
}

/**
 * Migrated from `src/app/settings-panel.spec.ts` (Phase 05 file migration)
 * with the action names updated to their renamed, module-prefixed form
 * (`toggleSettings`/`closeSettings` -> `ui/toggleSettings`/`ui/closeSettings`).
 */
describe('settings panel actions', () => {
    beforeAll(() => {
        registerUiActions();
    });

    afterEach(() => {
        resetState();
    });

    it('ui/toggleSettings flips ui.settingsOpen from unset to true', () => {
        const btn = document.createElement('button');
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'ui/toggleSettings');
        document.body.appendChild(btn);
        const destroy = bindDOM(document.body);

        btn.click();
        tick();
        expect(settingsOpen()).toBe(true);

        btn.click();
        tick();
        expect(settingsOpen()).toBe(false);

        destroy();
        btn.remove();
    });

    it('Escape closes an open panel through the bound handler', () => {
        // bindDOM(root) is idempotent per root identity and only scans once
        // — elements appended to an already-bound root are never picked up
        // by a second call. Both fixture elements must exist before the
        // single bindDOM() call below.
        const panel = document.createElement('div');
        panel.tabIndex = -1;
        panel.setAttribute('data-action', 'keydown.esc');
        panel.setAttribute('data-fn', 'ui/closeSettings');
        document.body.appendChild(panel);

        const toggleBtn = document.createElement('button');
        toggleBtn.setAttribute('data-action', 'click');
        toggleBtn.setAttribute('data-fn', 'ui/toggleSettings');
        document.body.appendChild(toggleBtn);

        const destroy = bindDOM(document.body);

        // Open first so close has an effect to prove.
        toggleBtn.click();
        tick();
        expect(settingsOpen()).toBe(true);

        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        tick();
        expect(settingsOpen()).toBe(false);

        destroy();
        panel.remove();
        toggleBtn.remove();
    });
});

/** Migrated from `src/ui/density.spec.ts`'s `setDensity action` block, renamed to `ui/setDensity` (Feature 05.2.3). */
describe('setDensity action', () => {
    beforeAll(() => {
        registerUiActions();
    });

    afterEach(() => {
        resetState();
    });

    function fixtureButton(density: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.dataset['density'] = density;
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'ui/setDensity');
        document.body.appendChild(btn);
        return btn;
    }

    it("sets ui.density to the clicked button's density", () => {
        const btn = fixtureButton('compact');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { density?: string } | undefined)?.density).toBe('compact');
        destroy();
        btn.remove();
    });

    it('ignores an invalid density value', () => {
        const btn = fixtureButton('huge');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { density?: string } | undefined)?.density).toBeUndefined();
        destroy();
        btn.remove();
    });
});

/** Phase 22 theme refresh — same `data-*` button-group contract as setDensity. */
describe('setTheme action', () => {
    beforeAll(() => {
        registerUiActions();
    });

    afterEach(() => {
        resetState();
        delete document.documentElement.dataset['theme'];
    });

    function fixtureButton(theme: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.dataset['theme'] = theme;
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'ui/setTheme');
        document.body.appendChild(btn);
        return btn;
    }

    it("sets ui.theme and the root data-theme to the clicked button's theme", () => {
        const btn = fixtureButton('light');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { theme?: string } | undefined)?.theme).toBe('light');
        expect(document.documentElement.dataset['theme']).toBe('light');
        destroy();
        btn.remove();
    });

    it('ignores an invalid theme value', () => {
        const btn = fixtureButton('pink');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { theme?: string } | undefined)?.theme).toBeUndefined();
        expect(document.documentElement.dataset['theme']).toBeUndefined();
        destroy();
        btn.remove();
    });
});

describe('setFontSize action', () => {
    beforeAll(() => {
        registerUiActions();
    });

    afterEach(() => {
        resetState();
        delete document.documentElement.dataset['fontSize'];
    });

    function fixtureButton(size: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.dataset['fontSize'] = size;
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'ui/setFontSize');
        document.body.appendChild(btn);
        return btn;
    }

    it("sets ui.fontSize and the root data-font-size to the clicked button's size", () => {
        const btn = fixtureButton('xlarge');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { fontSize?: string } | undefined)?.fontSize).toBe('xlarge');
        expect(document.documentElement.dataset['fontSize']).toBe('xlarge');
        destroy();
        btn.remove();
    });

    it('ignores an invalid size value', () => {
        const btn = fixtureButton('gigantic');
        const destroy = bindDOM(document.body);
        btn.click();
        tick();
        expect((appState['ui'] as { fontSize?: string } | undefined)?.fontSize).toBeUndefined();
        expect(document.documentElement.dataset['fontSize']).toBeUndefined();
        destroy();
        btn.remove();
    });
});
