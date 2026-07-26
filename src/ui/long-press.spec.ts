import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachLongPress, resetLongPressForTests, wasJustLongPressed } from './long-press';

function makePointerDown(el: HTMLElement, overrides: Partial<PointerEventInit> = {}): void {
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100, bubbles: true, ...overrides }));
}

describe('attachLongPress() (Feature 08.8.2)', () => {
    let container: HTMLElement;
    let row: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        row = document.createElement('div');
        row.className = 'row';
        row.dataset['id'] = 'ch-1';
        container.appendChild(row);
        document.body.appendChild(container);
        resetLongPressForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
        container.remove();
        resetLongPressForTests();
    });

    it('fires onLongPress after the hold threshold for a touch pointer', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row);
        expect(onLongPress).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);
        expect(onLongPress).toHaveBeenCalledWith(row);
    });

    it('ignores mouse pointers — mouse already has native right-click', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row, { pointerType: 'mouse' });
        vi.advanceTimersByTime(600);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cancels on pointerup before the threshold', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row);
        row.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
        vi.advanceTimersByTime(600);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cancels on movement past the threshold', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row);
        row.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 200, clientY: 200, bubbles: true }));
        vi.advanceTimersByTime(600);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('does not cancel on small movement within the threshold', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row);
        row.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: 103, clientY: 102, bubbles: true }));
        vi.advanceTimersByTime(500);
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('ignores a pointerdown outside any resolvable target', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, () => null, { onLongPress });
        makePointerDown(container);
        vi.advanceTimersByTime(600);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cleanup() stops future long-presses from firing', () => {
        const onLongPress = vi.fn();
        const cleanup = attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        cleanup();
        makePointerDown(row);
        vi.advanceTimersByTime(600);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('marks wasJustLongPressed() true right after firing, false after the suppression window (Feature 08.8.8)', () => {
        const onLongPress = vi.fn();
        attachLongPress(container, (t) => t.closest('.row'), { onLongPress });
        makePointerDown(row);
        vi.advanceTimersByTime(500);
        expect(wasJustLongPressed()).toBe(true);
        vi.advanceTimersByTime(400);
        expect(wasJustLongPressed()).toBe(false);
    });
});
