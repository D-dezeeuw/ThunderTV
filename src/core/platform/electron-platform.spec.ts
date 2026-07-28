import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_PROXY_TEMPLATE } from '../../state/settings';
import { effectiveProxyTemplate, createElectronPlatform } from './electron-platform';
import { fakeElectronBridge } from './fake-platform';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';

afterEach(() => {
    delete window.electron;
    resetState();
    resetPlatformForTests();
    localStorage.clear();
});

describe('effectiveProxyTemplate (desktop shell default)', () => {
    it('is undefined in a plain browser with no saved template', () => {
        expect(effectiveProxyTemplate()).toBeUndefined();
    });

    it('defaults to the embedded desktop proxy when the bridge is present', () => {
        window.electron = fakeElectronBridge('http://127.0.0.1:52301');
        expect(effectiveProxyTemplate()).toBe('http://127.0.0.1:52301/{url}');
    });

    it('a user-saved template wins over the desktop default', () => {
        window.electron = fakeElectronBridge('http://127.0.0.1:52301');
        setValue(SETTINGS_PROXY_TEMPLATE, 'https://my-proxy.example/{url}');
        tick();
        expect(effectiveProxyTemplate()).toBe('https://my-proxy.example/{url}');
    });
});

describe('createElectronPlatform', () => {
    it('assembles all four PlatformAdapter slots, named electron', async () => {
        const platform = await createElectronPlatform();
        expect(platform.name).toBe('electron');
        expect(platform.storage).toBeDefined();
        expect(platform.http).toBeDefined();
        expect(platform.files).toBeDefined();
        expect(platform.capabilities).toBeDefined();
    });

    it('reports corsUnrestricted true, unlike the web adapter', async () => {
        const platform = await createElectronPlatform();
        expect(platform.capabilities.corsUnrestricted).toBe(true);
        expect(platform.capabilities.externalPlayers).toBe(false);
    });

    it('capabilities.durableStorage always reflects the live storage tier', async () => {
        const platform = await createElectronPlatform();
        expect(platform.capabilities.durableStorage).toBe(platform.storage.tier);
    });

    it('the resulting instance round-trips through setPlatform/getPlatform', async () => {
        const platform = await createElectronPlatform();
        setPlatform(platform);
        expect(getPlatform()).toBe(platform);
    });
});

describe('createElectronPlatform.getDefaultXtreamAccount', () => {
    it('delegates to window.electron.getDefaultXtreamAccount()', async () => {
        const fixture = { url: 'http://example.com:8080', username: 'bob', password: 'secret' };
        window.electron = { ...fakeElectronBridge(), getDefaultXtreamAccount: () => Promise.resolve(fixture) };
        const platform = await createElectronPlatform();
        await expect(platform.getDefaultXtreamAccount?.()).resolves.toEqual(fixture);
    });

    it('resolves null when the bridge has no default account configured', async () => {
        window.electron = fakeElectronBridge();
        const platform = await createElectronPlatform();
        await expect(platform.getDefaultXtreamAccount?.()).resolves.toBeNull();
    });
});
