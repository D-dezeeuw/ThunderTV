import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';
import { createWebPlatform } from './web-platform';

afterEach(() => {
    resetPlatformForTests();
    localStorage.clear();
});

describe('createWebPlatform', () => {
    it('assembles all four PlatformAdapter slots', async () => {
        const platform = await createWebPlatform();
        expect(platform.name).toBe('web');
        expect(platform.storage).toBeDefined();
        expect(platform.http).toBeDefined();
        expect(platform.files).toBeDefined();
        expect(platform.capabilities).toBeDefined();
    });

    it('fixes corsUnrestricted and externalPlayers to false on the web', async () => {
        const platform = await createWebPlatform();
        expect(platform.capabilities.corsUnrestricted).toBe(false);
        expect(platform.capabilities.externalPlayers).toBe(false);
    });

    it('capabilities.durableStorage always reflects the live storage tier — no separately cached value to drift (Feature 04.7.5)', async () => {
        const platform = await createWebPlatform();
        expect(platform.capabilities.durableStorage).toBe(platform.storage.tier);
    });

    it('selects a real tier via the boot probe — jsdom has no indexedDB but a working localStorage, so this environment lands on partial', async () => {
        const platform = await createWebPlatform();
        expect(platform.storage.tier).toBe('partial');
    });

    it('performs no DOM/network work at import — only inside the factory', async () => {
        // Constructing twice must not throw or leak shared state between
        // instances (Feature 03.3.6/03.3.9).
        const first = await createWebPlatform();
        const second = await createWebPlatform();
        expect(first).not.toBe(second);
        expect(first.storage).not.toBe(second.storage);
    });

    it('the resulting instance round-trips through setPlatform/getPlatform', async () => {
        const platform = await createWebPlatform();
        setPlatform(platform);
        expect(getPlatform()).toBe(platform);
    });

    it('the boot-probed storage adapter actually stores and retrieves values', async () => {
        const platform = await createWebPlatform();
        await platform.storage.set('k', 'v');
        expect(await platform.storage.get('k')).toBe('v');
        await platform.storage.delete('k');
        expect(await platform.storage.get('k')).toBeUndefined();
    });
});
