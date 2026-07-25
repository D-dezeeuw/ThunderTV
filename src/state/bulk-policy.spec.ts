import { describe, expect, it, vi } from 'vitest';
import { PLAYER_ZAP_HISTORY } from './player';
import { assertCompact, MAX_RECORDED_COLLECTION } from './bulk-policy';

describe('assertCompact', () => {
    it('is silent for a non-array value', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        assertCompact('anything', { not: 'an array' });
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('is silent for an array at or under the global default ceiling', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        assertCompact('unregistered.key', new Array<number>(MAX_RECORDED_COLLECTION).fill(0));
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('warns (never throws) for an array over the global default ceiling on an unregistered key', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() =>
            assertCompact('unregistered.key', new Array<number>(MAX_RECORDED_COLLECTION + 1).fill(0)),
        ).not.toThrow();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('unregistered.key');
        warnSpy.mockRestore();
    });

    it("uses a registered key's own maxItems instead of the global ceiling", () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // player.zapHistory's registered maxItems (20) is far below the 1000
        // global default — this array would pass the global ceiling but must
        // still warn against the key's own, tighter cap (Feature 05.8.5).
        assertCompact(PLAYER_ZAP_HISTORY, new Array<number>(21).fill(0));
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain(PLAYER_ZAP_HISTORY);
        warnSpy.mockRestore();
    });

    it("is silent at exactly a registered key's maxItems boundary", () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        assertCompact(PLAYER_ZAP_HISTORY, new Array<number>(20).fill(0));
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
