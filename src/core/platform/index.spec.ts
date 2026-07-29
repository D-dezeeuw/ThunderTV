import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../storage/memory-storage';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';
import type { PlatformAdapter } from './platform-adapter';

function stubPlatform(): PlatformAdapter {
    return {
        name: 'web',
        storage: new MemoryStorage(),
        http: {
            get: () => Promise.reject(new Error('not implemented')),
            getText: () => Promise.resolve(null),
            getJson: () => Promise.resolve(null),
        },
        files: {
            pickFile: () => Promise.resolve(null),
            readText: () => Promise.resolve({ kind: 'ok', text: '' }),
        },
        downloads: {
            prepare: () => Promise.resolve(null),
            start: () => ({ cancel: () => undefined }),
        },
        capabilities: { corsUnrestricted: false, externalPlayers: false, durableStorage: 'none', downloads: 'none' },
    };
}

describe('platform accessor', () => {
    afterEach(() => {
        resetPlatformForTests();
    });

    it('throws before setPlatform() has run', () => {
        expect(() => getPlatform()).toThrow(/before setPlatform/);
    });

    it('returns the same instance after setPlatform()', () => {
        const platform = stubPlatform();
        setPlatform(platform);
        expect(getPlatform()).toBe(platform);
        expect(getPlatform()).toBe(platform);
    });

    it('rejects double initialization', () => {
        setPlatform(stubPlatform());
        expect(() => setPlatform(stubPlatform())).toThrow(/twice/);
    });
});
