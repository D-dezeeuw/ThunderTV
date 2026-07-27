import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_PROXY_TEMPLATE } from '../../state/settings';
import { effectiveProxyTemplate } from './desktop-proxy';

type DesktopWindow = Window & { thunderDesktop?: { proxyOrigin?: string } };

describe('effectiveProxyTemplate (desktop shell default)', () => {
    afterEach(() => {
        delete (window as DesktopWindow).thunderDesktop;
        resetState();
    });

    it('is undefined in a plain browser with no saved template', () => {
        expect(effectiveProxyTemplate()).toBeUndefined();
    });

    it('defaults to the embedded desktop proxy when the bridge is present', () => {
        (window as DesktopWindow).thunderDesktop = { proxyOrigin: 'http://127.0.0.1:52301' };
        expect(effectiveProxyTemplate()).toBe('http://127.0.0.1:52301/{url}');
    });

    it('a user-saved template wins over the desktop default', () => {
        (window as DesktopWindow).thunderDesktop = { proxyOrigin: 'http://127.0.0.1:52301' };
        setValue(SETTINGS_PROXY_TEMPLATE, 'https://my-proxy.example/{url}');
        tick();
        expect(effectiveProxyTemplate()).toBe('https://my-proxy.example/{url}');
    });
});
