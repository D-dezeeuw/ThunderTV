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

    it('reports no CORS freedom with no proxy getter, and never external players', async () => {
        const platform = await createWebPlatform();
        expect(platform.capabilities.corsUnrestricted).toBe(false);
        expect(platform.capabilities.externalPlayers).toBe(false);
    });

    // Read live, not snapshotted: the user sets the proxy from Settings long
    // after the platform is constructed, and only a valid template counts —
    // `applyProxy` would ignore an empty one, so reporting CORS freedom for it
    // would be a lie the warning surface acts on.
    it('derives corsUnrestricted from the live proxy template, ignoring empty and invalid ones', async () => {
        let template: string | undefined;
        const platform = await createWebPlatform({ getProxyTemplate: () => template });
        expect(platform.capabilities.corsUnrestricted).toBe(false);

        template = '';
        expect(platform.capabilities.corsUnrestricted).toBe(false);

        template = 'not a url';
        expect(platform.capabilities.corsUnrestricted).toBe(false);

        template = 'http://insecure.example/{url}';
        expect(platform.capabilities.corsUnrestricted).toBe(false);

        template = 'https://my-proxy.example/{url}';
        expect(platform.capabilities.corsUnrestricted).toBe(true);
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
