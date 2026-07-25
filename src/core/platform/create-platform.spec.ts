import { afterEach, describe, expect, it } from 'vitest';
import { createPlatform } from './create-platform';

afterEach(() => {
    delete (window as { electron?: unknown }).electron;
});

describe('createPlatform', () => {
    it('selects WebPlatform when window.electron is absent', async () => {
        const platform = await createPlatform();
        expect(platform.name).toBe('web');
    });

    it('selects the (not yet implemented) Electron branch when window.electron is truthy', async () => {
        (window as { electron?: unknown }).electron = {};
        await expect(createPlatform()).rejects.toThrow(/Phase 28/);
    });
});
