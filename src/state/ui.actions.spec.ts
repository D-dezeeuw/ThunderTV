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
