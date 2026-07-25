import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyProxy, isValidProxyTemplate } from './proxy';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('applyProxy', () => {
    it('substitutes the encoded target into {url}', () => {
        const result = applyProxy('https://my-proxy.example/{url}', 'https://provider.example/list.m3u?u=x');
        expect(result).toBe(
            'https://my-proxy.example/' + encodeURIComponent('https://provider.example/list.m3u?u=x'),
        );
    });

    it('round-trips the encoded target back to the original via decodeURIComponent', () => {
        const target = 'https://provider.example/get.php?username=me&password=p@ss&type=m3u';
        const result = applyProxy('https://my-proxy.example/{url}', target);
        const encoded = result.slice('https://my-proxy.example/'.length);
        expect(decodeURIComponent(encoded)).toBe(target);
    });

    it('appends the encoded URL when the template has no {url} placeholder', () => {
        const result = applyProxy('https://my-proxy.example/fetch?target=', 'https://provider.example/list.m3u');
        expect(result).toBe(
            'https://my-proxy.example/fetch?target=' + encodeURIComponent('https://provider.example/list.m3u'),
        );
    });

    it('is a no-op when no template is configured', () => {
        expect(applyProxy(undefined, 'https://provider.example/list.m3u')).toBe(
            'https://provider.example/list.m3u',
        );
    });

    it('never proxies a same-origin request', () => {
        vi.stubGlobal('location', { ...location, origin: 'https://thundertv.example', href: 'https://thundertv.example/' });
        const result = applyProxy('https://my-proxy.example/{url}', 'https://thundertv.example/vendor/spektrum.min.js');
        expect(result).toBe('https://thundertv.example/vendor/spektrum.min.js');
    });
});

describe('isValidProxyTemplate', () => {
    it('accepts https:// templates', () => {
        expect(isValidProxyTemplate('https://my-proxy.example/{url}')).toBe(true);
        expect(isValidProxyTemplate('https://my-proxy.example/fetch?target=')).toBe(true);
    });

    it('accepts http://localhost and http://127.0.0.1 for local development', () => {
        expect(isValidProxyTemplate('http://localhost:8787/{url}')).toBe(true);
        expect(isValidProxyTemplate('http://127.0.0.1:8787/{url}')).toBe(true);
    });

    it('rejects a plain http:// template against a real host', () => {
        expect(isValidProxyTemplate('http://my-proxy.example/{url}')).toBe(false);
    });

    it('rejects an unparseable template', () => {
        expect(isValidProxyTemplate('not a url')).toBe(false);
    });
});
