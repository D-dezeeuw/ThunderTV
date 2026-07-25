import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifiedFetch, mixedContentBlocked } from './classified-fetch';

function jsonResponse(body: string | null, init?: ResponseInit): Response {
    return new Response(body, init);
}

/** Rejects `reject` with the signal's abort reason once it fires — a real DOMException at runtime (`AbortSignal.reason` is `any` by lib.dom). */
function rejectOnAbort(signal: AbortSignal | null | undefined, reject: (reason: unknown) => void): void {
    signal?.addEventListener('abort', () => reject(signal.reason));
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('classifiedFetch', () => {
    it('resolves ok on 200, exposing the raw Response and header metadata', async () => {
        const res = jsonResponse('hello', {
            status: 200,
            headers: { etag: '"abc"', 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT' },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

        const result = await classifiedFetch('https://provider.example/list.m3u');
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error('expected ok');
        expect(await result.res.text()).toBe('hello');
        expect(result.etag).toBe('"abc"');
        expect(result.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    });

    it('resolves http on a non-2xx status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('', { status: 500 })));
        const result = await classifiedFetch('https://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'http', status: 500 });
    });

    it('folds 304 into the http kind without attempting a body read', async () => {
        // 304 is a null-body status per the Fetch spec — Response's
        // constructor throws if given a non-null body alongside it.
        const res = jsonResponse(null, { status: 304 });
        const textSpy = vi.spyOn(res, 'text');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

        const result = await classifiedFetch('https://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'http', status: 304 });
        expect(textSpy).not.toHaveBeenCalled();
    });

    it('resolves timeout on a TimeoutError DOMException', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
        const result = await classifiedFetch('https://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'timeout' });
    });

    it('resolves cors-or-network with crossOrigin true for a cross-origin TypeError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const result = await classifiedFetch('https://other-origin.example/list.m3u');
        expect(result).toEqual({ kind: 'cors-or-network', crossOrigin: true, offlineHint: false });
    });

    it('resolves cors-or-network with crossOrigin false for a same-origin TypeError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const result = await classifiedFetch(location.origin + '/local-asset.json');
        expect(result).toEqual({ kind: 'cors-or-network', crossOrigin: false, offlineHint: false });
    });

    it('sets offlineHint when navigator.onLine is false', async () => {
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const result = await classifiedFetch('https://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'cors-or-network', crossOrigin: true, offlineHint: true });
    });

    it('resolves mixed-content for an http:// target from an https:// page without calling fetch', async () => {
        vi.stubGlobal('location', { ...location, protocol: 'https:' });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await classifiedFetch('http://provider.example/list.m3u');
        expect(result).toEqual({ kind: 'mixed-content' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never throws for a relative or invalid URL', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(classifiedFetch('not a url at all')).resolves.toMatchObject({ kind: 'cors-or-network' });
        await expect(classifiedFetch('/relative/path.m3u')).resolves.toMatchObject({ kind: 'cors-or-network' });
    });

    it('handles URLs with ports and query strings without misclassifying origin', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const result = await classifiedFetch('https://provider.example:8443/get.php?u=x&p=y');
        expect(result).toEqual({ kind: 'cors-or-network', crossOrigin: true, offlineHint: false });
    });

    it('rethrows a caller-initiated abort instead of classifying it', async () => {
        const controller = new AbortController();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, init: RequestInit) => {
                return new Promise((_resolve, reject) => rejectOnAbort(init.signal, reject));
            }),
        );

        const pending = classifiedFetch('https://provider.example/list.m3u', { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toThrow(/abort/i);
    });

    it('classifies too-large from a Content-Length over the limit without reading the body', async () => {
        const res = jsonResponse('x'.repeat(1000), {
            status: 200,
            headers: { 'content-length': '1000' },
        });
        const textSpy = vi.spyOn(res, 'text');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

        const result = await classifiedFetch('https://provider.example/huge.xml', { maxBytes: 100 });
        expect(result).toEqual({ kind: 'too-large', limitBytes: 100 });
        expect(textSpy).not.toHaveBeenCalled();
    });

    it('lazily caps a chunked (no Content-Length) body once the caller reads past maxBytes', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('a'.repeat(60)));
                controller.enqueue(new TextEncoder().encode('b'.repeat(60)));
                controller.close();
            },
        });
        const res = new Response(stream, { status: 200 });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

        const result = await classifiedFetch('https://provider.example/huge.xml', { maxBytes: 100 });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error('expected ok');
        await expect(result.res.text()).rejects.toThrow(/maxBytes/);
    });

    it('never logs the raw URL on a classified failure', async () => {
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        const url = 'https://provider.example/get.php?username=me&password=secret';
        await classifiedFetch(url);

        for (const call of [...logSpy.mock.calls, ...warnSpy.mock.calls].flat()) {
            expect(String(call)).not.toContain(url);
        }
    });

    it('falls back to manual signal combining when AbortSignal.any is unavailable', async () => {
        const original = AbortSignal.any.bind(AbortSignal);
        // @ts-expect-error — deliberately simulating an engine without AbortSignal.any (Feature 03.4.2).
        delete AbortSignal.any;
        try {
            const controller = new AbortController();
            vi.stubGlobal(
                'fetch',
                vi.fn().mockImplementation((_url: string, init: RequestInit) => {
                    return new Promise((_resolve, reject) => rejectOnAbort(init.signal, reject));
                }),
            );
            const pending = classifiedFetch('https://provider.example/list.m3u', { signal: controller.signal });
            controller.abort();
            await expect(pending).rejects.toThrow();
        } finally {
            AbortSignal.any = original;
        }
    });
});

describe('mixedContentBlocked', () => {
    it('is true only for an http:// target from an https:// page', () => {
        vi.stubGlobal('location', { ...location, protocol: 'https:' });
        expect(mixedContentBlocked('http://provider.example/stream')).toBe(true);
        expect(mixedContentBlocked('https://provider.example/stream')).toBe(false);
    });

    it('is false from an http:// page regardless of target', () => {
        vi.stubGlobal('location', { ...location, protocol: 'http:' });
        expect(mixedContentBlocked('http://provider.example/stream')).toBe(false);
    });
});
