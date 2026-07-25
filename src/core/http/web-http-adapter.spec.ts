import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebHttpAdapter } from './web-http-adapter';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Rejects `reject` with the signal's abort reason once it fires — a real DOMException at runtime (`AbortSignal.reason` is `any` by lib.dom). */
function rejectOnAbort(signal: AbortSignal | null | undefined, reject: (reason: unknown) => void): void {
    signal?.addEventListener('abort', () => reject(signal.reason));
}

describe('WebHttpAdapter', () => {
    it('applies the configured proxy template to the request URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const adapter = new WebHttpAdapter({ getProxyTemplate: () => 'https://my-proxy.example/{url}' });
        await adapter.get('https://provider.example/list.m3u');

        const [calledUrl] = fetchMock.mock.calls[0] as [string];
        expect(calledUrl).toBe(
            'https://my-proxy.example/' + encodeURIComponent('https://provider.example/list.m3u'),
        );
    });

    it('hits the raw URL when no proxy template is configured', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const adapter = new WebHttpAdapter();
        await adapter.get('https://provider.example/list.m3u');

        const [calledUrl] = fetchMock.mock.calls[0] as [string];
        expect(calledUrl).toBe('https://provider.example/list.m3u');
    });

    it('bypasses a configured proxy when noProxy is set', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const adapter = new WebHttpAdapter({ getProxyTemplate: () => 'https://my-proxy.example/{url}' });
        await adapter.get('https://provider.example/list.m3u', { noProxy: true });

        const [calledUrl] = fetchMock.mock.calls[0] as [string];
        expect(calledUrl).toBe('https://provider.example/list.m3u');
    });

    it('marks a failure as viaProxy when the request went through a configured proxy', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        const adapter = new WebHttpAdapter({ getProxyTemplate: () => 'https://my-proxy.example/{url}' });
        const result = await adapter.get('https://provider.example/list.m3u');

        expect(result).toMatchObject({ kind: 'cors-or-network', viaProxy: true });
    });

    it('does not mark a failure as viaProxy when no proxy is configured', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        const adapter = new WebHttpAdapter();
        const result = await adapter.get('https://provider.example/list.m3u');

        expect(result).not.toHaveProperty('viaProxy');
    });

    it('fires the configured timeout as a classified timeout', async () => {
        // A short *real* timeout rather than vi.useFakeTimers(): AbortSignal.timeout()
        // schedules natively and isn't guaranteed to observe JS-level fake timers.
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, init: RequestInit) => {
                return new Promise((_resolve, reject) => rejectOnAbort(init.signal, reject));
            }),
        );

        const adapter = new WebHttpAdapter({ defaultTimeoutMs: 20 });
        const result = await adapter.get('https://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'timeout' });
    });

    it('rejects promptly on a caller-supplied abort instead of waiting for the timeout', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, init: RequestInit) => {
                return new Promise((_resolve, reject) => rejectOnAbort(init.signal, reject));
            }),
        );

        const controller = new AbortController();
        const adapter = new WebHttpAdapter({ defaultTimeoutMs: 60_000 });
        const pending = adapter.get('https://provider.example/list.m3u', { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toThrow();
    });

    it('returns status 304 without reading the body via getText', async () => {
        // 304 is a null-body status per the Fetch spec.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
        const adapter = new WebHttpAdapter();
        expect(await adapter.getText('https://provider.example/list.m3u')).toBeNull();
    });

    it('getJson parses a valid JSON body and returns null for invalid JSON', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValueOnce(new Response('{"a":1}', { status: 200 })).mockResolvedValueOnce(
                new Response('not json', { status: 200 }),
            ),
        );
        const adapter = new WebHttpAdapter();
        expect(await adapter.getJson('https://provider.example/a.json')).toEqual({ a: 1 });
        expect(await adapter.getJson('https://provider.example/b.json')).toBeNull();
    });
});
