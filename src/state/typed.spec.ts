import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAVORITES_IDS } from './favorites';
import { UI_LIST_STATE } from './list-state';
import { PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import { get, replace, set } from './typed';

describe('typed set/get (Feature 05.9.2)', () => {
    afterEach(() => {
        resetState();
    });

    it('set() writes through to Spektrum state, readable via get() after a tick', () => {
        set('probe.scalar', 42);
        tick();
        expect(get<number>('probe.scalar')).toBe(42);
    });

    it('get() returns undefined for a key nothing has set', () => {
        expect(get('probe.neverSet')).toBeUndefined();
    });
});

describe('typed set() merges object values onto existing state (Spektrum engine behavior, Feature 08.6/08.8 finding)', () => {
    afterEach(() => {
        resetState();
    });

    it('a second set() with an object value leaves keys the new object omits untouched', () => {
        set('probe.map', { a: 1, b: 2 });
        tick();
        set('probe.map', { a: 99 });
        tick();
        expect(get<Record<string, number>>('probe.map')).toEqual({ a: 99, b: 2 });
    });
});

describe('typed replace() (Feature 08.6.7/08.8.6 — a true replace where set() would merge)', () => {
    afterEach(() => {
        resetState();
    });

    it('a shrunk object value actually loses the omitted key, unlike set()', () => {
        set('probe.map', { a: 1, b: 2 });
        tick();
        replace('probe.map', { a: 99 });
        tick();
        expect(get<Record<string, number>>('probe.map')).toEqual({ a: 99 });
    });

    it('replacing with an empty object truly clears every key', () => {
        set('probe.map', { a: 1, b: 2 });
        tick();
        replace('probe.map', {});
        tick();
        expect(get<Record<string, number>>('probe.map')).toEqual({});
    });
});

describe('typed set() dev-mode bulk guard (Feature 05.8.2)', () => {
    afterEach(() => {
        resetState();
    });

    it("warns when an array payload exceeds a registered key's maxItems", () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        set(PLAYER_ZAP_HISTORY, new Array<number>(ZAP_HISTORY_CAP + 1).fill(0));
        expect(warnSpy).toHaveBeenCalledTimes(1);
        warnSpy.mockRestore();
    });

    it("stays silent at exactly a registered key's maxItems boundary", () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        set(PLAYER_ZAP_HISTORY, new Array<number>(ZAP_HISTORY_CAP).fill(0));
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('stays silent for a non-array value regardless of key', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        set('probe.scalar', 'not an array');
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

/**
 * UPGRADES U11. Spektrum's `setValue()` deep-merges object values, so a
 * write with fewer keys than the last one silently leaves the removed keys
 * in live state. `replace()` has always been the correct call; before this
 * gate, remembering to use it was the only thing enforcing that.
 */
describe('mapShaped gate (UPGRADES U11)', () => {
    afterEach(() => {
        resetState();
    });

    it('set() refuses an object write on a map-shaped key, and says what to use instead', () => {
        expect(() => {
            set(FAVORITES_IDS, { a: true });
        }).toThrow(/replace\(\)/);
    });

    it('replace() — the sanctioned write — is unaffected', () => {
        expect(() => {
            replace(FAVORITES_IDS, { a: true });
        }).not.toThrow();
        tick();
        expect(get<Record<string, true>>(FAVORITES_IDS)).toEqual({ a: true });
    });

    it('leaves scalars and arrays alone: only a plain object can merge', () => {
        expect(() => {
            set(FAVORITES_IDS, null);
        }).not.toThrow();
        expect(() => {
            set(UI_LIST_STATE, undefined);
        }).not.toThrow();
    });

    it('says nothing about an unregistered key', () => {
        expect(() => {
            set('probe.map', { a: 1 });
        }).not.toThrow();
    });
});
