import { appState, bindDOM, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerSettingsPanelActions } from './settings-panel';

function settingsOpen(): boolean | undefined {
    return (appState['ui'] as { settingsOpen?: boolean } | undefined)?.settingsOpen;
}

describe('settings panel actions', () => {
    beforeAll(() => {
        registerSettingsPanelActions();
    });

    afterEach(() => {
        resetState();
    });

    it('toggleSettings flips ui.settingsOpen from unset to true', () => {
        const btn = document.createElement('button');
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'toggleSettings');
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
        panel.setAttribute('data-fn', 'closeSettings');
        document.body.appendChild(panel);

        const toggleBtn = document.createElement('button');
        toggleBtn.setAttribute('data-action', 'click');
        toggleBtn.setAttribute('data-fn', 'toggleSettings');
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
