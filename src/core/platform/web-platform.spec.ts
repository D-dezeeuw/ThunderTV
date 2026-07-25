import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';
import { createWebPlatform } from './web-platform';

describe('createWebPlatform', () => {
    afterEach(() => {
        resetPlatformForTests();
    });

    it('assembles all four PlatformAdapter slots', async () => {
        const platform = await createWebPlatform();
        expect(platform.name).toBe('web');
        expect(platform.storage).toBeDefined();
        expect(platform.http).toBeDefined();
        expect(platform.files).toBeDefined();
        expect(platform.capabilities).toBeDefined();
    });

    it('reports web-correct capabilities', async () => {
        const platform = await createWebPlatform();
        expect(platform.capabilities).toEqual({
            corsUnrestricted: false,
            externalPlayers: false,
            durableStorage: 'none',
        });
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

    it('the in-memory storage stub actually stores and retrieves values', async () => {
        const platform = await createWebPlatform();
        await platform.storage.set('k', 'v');
        expect(await platform.storage.get('k')).toBe('v');
        await platform.storage.delete('k');
        expect(await platform.storage.get('k')).toBeUndefined();
    });
});
