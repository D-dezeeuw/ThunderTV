import { afterEach, describe, expect, it } from 'vitest';
import { createPlatform } from './create-platform';

afterEach(() => {
    delete window.electron;
    localStorage.clear();
});

describe('createPlatform', () => {
    it('selects WebPlatform when window.electron is absent', async () => {
        const platform = await createPlatform();
        expect(platform.name).toBe('web');
    });

    it('selects the Electron adapter when window.electron is present, non-throwing', async () => {
        window.electron = { proxyOrigin: 'http://127.0.0.1:52301', appVersion: '0.0.0' };
        const platform = await createPlatform();
        expect(platform.name).toBe('electron');
        expect(platform.capabilities.corsUnrestricted).toBe(true);
    });
});
