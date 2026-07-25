import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import { get, set } from './typed';

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
