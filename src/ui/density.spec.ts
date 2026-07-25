import { appState, bindDOM, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerDensityAction, rowHeight } from './density';

describe('rowHeight', () => {
    it('maps compact to 32', () => {
        expect(rowHeight('compact')).toBe(32);
    });

    it('maps comfortable to 44', () => {
        expect(rowHeight('comfortable')).toBe(44);
    });
});

describe('setDensity action', () => {
    beforeAll(() => {
        registerDensityAction();
    });

    afterEach(() => {
        resetState();
    });

    function fixtureButton(density: string): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.dataset['density'] = density;
        btn.setAttribute('data-action', 'click');
        btn.setAttribute('data-fn', 'setDensity');
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
