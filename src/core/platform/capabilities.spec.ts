import { describe, expect, it } from 'vitest';
import { createWebCapabilities } from './capabilities';

describe('createWebCapabilities', () => {
    it('reports no CORS freedom on a bare web platform, and never external players', () => {
        const capabilities = createWebCapabilities('full');
        expect(capabilities.corsUnrestricted).toBe(false);
        expect(capabilities.externalPlayers).toBe(false);
    });

    // A configured proxy covers the API, the stream URL, logos and (via
    // manifest rewriting) segments — so the browser really is CORS-free, and
    // the warning surface gated on this flag must stop firing.
    it('reports CORS freedom once a proxy is configured, without touching externalPlayers', () => {
        const capabilities = createWebCapabilities('full', true);
        expect(capabilities.corsUnrestricted).toBe(true);
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
