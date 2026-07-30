import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSpatialNavigation } from './navigator';

let cleanup: (() => void) | null = null;

/**
 * jsdom gives every element a zero-size rect, so layout has to be supplied
 * by hand — which is also what keeps these tests about *behaviour* (does
 * the press move focus, is it deferred, is it prevented) rather than about
 * geometry, which `geometry.spec.ts` covers directly.
 */
function layout(element: HTMLElement, x: number, y: number, w = 100, h = 40): void {
    element.getBoundingClientRect = () =>
        ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) });
    element.checkVisibility = () => true;
    element.scrollIntoView = () => undefined;
}

function press(key: string, extra: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
    document.dispatchEvent(event);
    return event;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('spatial navigation', () => {
    it('moves focus to the element in the pressed direction', () => {
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(a, 0, 0);
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        a.focus();
        const event = press('ArrowDown');

        expect(document.activeElement).toBe(b);
        expect(event.defaultPrevented).toBe(true);
    });

    it('does nothing at an edge — focus never wraps around', () => {
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(a, 0, 0);
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        a.focus();
        const event = press('ArrowUp');

        expect(document.activeElement).toBe(a);
        expect(event.defaultPrevented).toBe(false);
    });

    it('leaves a text input\'s own arrow keys alone', () => {
        document.body.innerHTML = '<input id="i" /><button id="b">B</button>';
        const input = document.getElementById('i') as HTMLInputElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(input, 0, 0);
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        input.focus();
        const event = press('ArrowDown');

        expect(document.activeElement).toBe(input);
        expect(event.defaultPrevented).toBe(false);
    });

    it('leaves vertical presses inside the channel list to the list\'s own row cursor, but handles horizontal ones', () => {
        document.body.innerHTML = '<div class="list"><button id="row">Row</button></div><button id="side">Side</button>';
        const row = document.getElementById('row') as HTMLButtonElement;
        const side = document.getElementById('side') as HTMLButtonElement;
        layout(row, 100, 100);
        layout(side, 0, 100, 50, 40);

        cleanup = registerSpatialNavigation();
        row.focus();

        // Down belongs to the list.
        expect(press('ArrowDown').defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(row);

        // Left is how you get out of the list — nothing else provides that.
        expect(press('ArrowLeft').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(side);
    });

    it('ignores modified presses, so desktop shortcuts keep working', () => {
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(a, 0, 0);
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        a.focus();

        for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const) {
            press('ArrowDown', { [modifier]: true });
            expect(document.activeElement).toBe(a);
        }
    });

    it('skips hidden and zero-size elements', () => {
        document.body.innerHTML = '<button id="a">A</button><button id="hidden">H</button><button id="b">B</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        const hidden = document.getElementById('hidden') as HTMLButtonElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(a, 0, 0);
        layout(hidden, 0, 50, 0, 0); // zero-size: a `data-if`-hidden control
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        a.focus();
        press('ArrowDown');

        expect(document.activeElement).toBe(b);
    });

    it('excludes background content while a dialog is open', () => {
        document.body.innerHTML =
            '<button id="bg">BG</button><div role="dialog"><button id="d1">D1</button></div>';
        const bg = document.getElementById('bg') as HTMLButtonElement;
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        const d1 = document.getElementById('d1') as HTMLButtonElement;
        layout(bg, 0, 100);
        layout(dialog, 0, 0, 300, 300);
        layout(d1, 0, 0);

        cleanup = registerSpatialNavigation();
        d1.focus();
        const event = press('ArrowDown');

        // Geometrically "bg" is the next candidate below d1 — excluded because
        // it sits outside the open dialog, so the press has nowhere to go.
        expect(document.activeElement).toBe(d1);
        expect(event.defaultPrevented).toBe(false);
    });

    it('still navigates between elements inside an open dialog', () => {
        document.body.innerHTML = '<div role="dialog"><button id="d1">D1</button><button id="d2">D2</button></div>';
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        const d1 = document.getElementById('d1') as HTMLButtonElement;
        const d2 = document.getElementById('d2') as HTMLButtonElement;
        layout(dialog, 0, 0, 300, 300);
        layout(d1, 0, 0);
        layout(d2, 0, 100);

        cleanup = registerSpatialNavigation();
        d1.focus();
        press('ArrowDown');

        expect(document.activeElement).toBe(d2);
    });

    it('routes a webOS Back keyCode to the handler and respects its answer', () => {
        cleanup = registerSpatialNavigation({ onBack: () => true });
        expect(press('Unidentified', { keyCode: 461 }).defaultPrevented).toBe(true);

        cleanup();
        cleanup = registerSpatialNavigation({ onBack: () => false });
        expect(press('Unidentified', { keyCode: 461 }).defaultPrevented).toBe(false);
    });

    it('accepts legacy numeric arrow codes from older TV webviews', () => {
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        const b = document.getElementById('b') as HTMLButtonElement;
        layout(a, 0, 0);
        layout(b, 0, 100);

        cleanup = registerSpatialNavigation();
        a.focus();
        press('Unidentified', { keyCode: 40 });

        expect(document.activeElement).toBe(b);
    });

    it('activates a generic [tabindex] element on Enter, and leaves buttons to their native behaviour', () => {
        document.body.innerHTML = '<div id="card" tabindex="0">Card</div><button id="btn">B</button>';
        const card = document.getElementById('card') as HTMLElement;
        const btn = document.getElementById('btn') as HTMLButtonElement;
        layout(card, 0, 0);
        layout(btn, 0, 100);
        const cardClick = vi.fn();
        const btnClick = vi.fn();
        card.addEventListener('click', cardClick);
        btn.addEventListener('click', btnClick);

        cleanup = registerSpatialNavigation();

        card.focus();
        press('Enter');
        expect(cardClick).toHaveBeenCalledTimes(1);

        btn.focus();
        press('Enter');
        // Not synthesised — the browser already does this for a real button.
        expect(btnClick).not.toHaveBeenCalled();
    });

    it('starts from the viewport origin when nothing is focused yet', () => {
        document.body.innerHTML = '<button id="a">A</button>';
        const a = document.getElementById('a') as HTMLButtonElement;
        layout(a, 200, 200);

        cleanup = registerSpatialNavigation();
        (document.activeElement as HTMLElement | null)?.blur();
        press('ArrowDown');

        expect(document.activeElement).toBe(a);
    });
});
