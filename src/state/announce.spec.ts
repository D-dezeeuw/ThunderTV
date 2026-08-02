import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { announce } from './ui.actions';
import { initUiState, UI_ANNOUNCEMENT } from './ui';
import { get } from './typed';

/** Feature 25.8.5 — the screen-reader announcement channel. */
describe('announce', () => {
    afterEach(() => {
        resetState();
    });

    it('publishes the message', () => {
        initUiState();
        announce('Storage is limited.');
        tick();
        expect(get<string>(UI_ANNOUNCEMENT)).toBe('Storage is limited.');
    });

    it('blanks the region before repeating an identical message', () => {
        // The whole point: a live region only speaks when its text *changes*,
        // so two identical failures in a row would be silent the second time
        // without the intervening blank — and the second one is exactly when
        // a user is waiting to hear something.
        initUiState();
        announce('Stream unavailable.');
        tick();

        announce('Stream unavailable.');
        // Before the tick drains, the region is blank — that transition is
        // what makes the repeat audible.
        expect(get<string>(UI_ANNOUNCEMENT)).toBe('');
        tick();
        expect(get<string>(UI_ANNOUNCEMENT)).toBe('Stream unavailable.');
    });

    it('ignores an empty or whitespace-only message rather than clearing the region', () => {
        initUiState();
        announce('Still here.');
        tick();

        announce('   ');
        tick();
        expect(get<string>(UI_ANNOUNCEMENT)).toBe('Still here.');
    });
});
