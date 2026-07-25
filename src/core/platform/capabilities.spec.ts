import { describe, expect, it } from 'vitest';
import { createWebCapabilities } from './capabilities';

describe('createWebCapabilities', () => {
    it('fixes corsUnrestricted and externalPlayers to false on the web', () => {
        const capabilities = createWebCapabilities('full');
        expect(capabilities.corsUnrestricted).toBe(false);
        expect(capabilities.externalPlayers).toBe(false);
    });

    it('passes durableStorage through as given', () => {
        expect(createWebCapabilities('none').durableStorage).toBe('none');
        expect(createWebCapabilities('partial').durableStorage).toBe('partial');
        expect(createWebCapabilities('full').durableStorage).toBe('full');
    });

    it('is frozen — TypeScript rejects mutation at compile time', () => {
        const capabilities = createWebCapabilities('none');
        expect(Object.isFrozen(capabilities)).toBe(true);
        expect(() => {
            // @ts-expect-error — Capabilities fields are readonly; this line exists to prove the compiler rejects it.
            capabilities.corsUnrestricted = true;
        }).toThrow(TypeError);
    });
});
