import { appState, resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform } from './index';
import { createFakePlatform, FakeHttpAdapter, withFakePlatform } from './fake-platform';

describe('FakeHttpAdapter', () => {
    it('replies with a scripted ok result including a readable body', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('https://provider.example/list.m3u').reply({ kind: 'ok', body: '#EXTM3U' });

        const result = await http.get('https://provider.example/list.m3u');
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error('expected ok');
        expect(await result.res.text()).toBe('#EXTM3U');
    });

    it('replies with every scripted failure kind', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('/http').reply({ kind: 'http', status: 503 });
        http.onGet('/timeout').reply({ kind: 'timeout' });
        http.onGet('/cors').reply({ kind: 'cors-or-network', crossOrigin: true, offlineHint: true });
        http.onGet('/mixed').reply({ kind: 'mixed-content' });
        http.onGet('/large').reply({ kind: 'too-large', limitBytes: 42 });

        expect(await http.get('/http')).toEqual({ kind: 'http', status: 503 });
        expect(await http.get('/timeout')).toEqual({ kind: 'timeout' });
        expect(await http.get('/cors')).toEqual({ kind: 'cors-or-network', crossOrigin: true, offlineHint: true });
        expect(await http.get('/mixed')).toEqual({ kind: 'mixed-content' });
        expect(await http.get('/large')).toEqual({ kind: 'too-large', limitBytes: 42 });
    });

    it('throws when a URL has no scripted reply — a spec bug, not a classified failure', () => {
        const http = new FakeHttpAdapter();
        expect(() => http.get('/never-scripted')).toThrow(/no scripted reply/);
    });

    it('records every call and clears on reset()', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('/a').reply({ kind: 'ok' });
        await http.get('/a', { headers: { 'x-test': '1' } });
        expect(http.calls).toEqual([{ url: '/a', options: { headers: { 'x-test': '1' } } }]);

        http.reset();
        expect(http.calls).toEqual([]);
        expect(() => http.get('/a')).toThrow(/no scripted reply/);
    });

    it('getJson parses a scripted JSON body', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('/data.json').reply({ kind: 'ok', body: '{"n":42}' });
        expect(await http.getJson('/data.json')).toEqual({ n: 42 });
    });
});

describe('FakeHttpAdapter contract parity with WebHttpAdapter', () => {
    it('an ok reply carries the same shape (kind/res/etag/lastModified) as a real classified result', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('/x').reply({ kind: 'ok', body: 'hi', headers: { etag: '"1"' } });
        const result = await http.get('/x');

        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error('expected ok');
        expect(result.res).toBeInstanceOf(Response);
        expect(typeof result.etag === 'string' || result.etag === null).toBe(true);
        expect(typeof result.lastModified === 'string' || result.lastModified === null).toBe(true);
    });

    it('a 304 reply is representable via the http kind, matching the real adapter (Feature 03.10.7)', async () => {
        const http = new FakeHttpAdapter();
        http.onGet('/x').reply({ kind: 'http', status: 304 });
        expect(await http.get('/x')).toEqual({ kind: 'http', status: 304 });
    });
});

describe('FakeFileAdapter', () => {
    it('resolves seeded files in order and records the accept args requested', async () => {
        const { files } = createFakePlatform();
        const file = new File(['x'], 'a.m3u');
        files.seed({ name: 'a.m3u', size: file.size, file });

        expect(await files.pickFile('.m3u')).toEqual({ name: 'a.m3u', size: file.size, file });
        expect(await files.pickFile('.m3u')).toBeNull();
        expect(files.picks).toEqual(['.m3u', '.m3u']);
    });
});

describe('MemoryStorage', () => {
    it('round-trips values and removes them on delete()', async () => {
        const { storage } = createFakePlatform();
        await storage.set('k', 'v');
        expect(await storage.get('k')).toBe('v');
        await storage.delete('k');
        expect(await storage.get('k')).toBeUndefined();
    });
});

describe('withFakePlatform', () => {
    afterEach(() => {
        resetState();
    });

    it('installs the fake for the duration of fn and restores the accessor afterward', async () => {
        await withFakePlatform({}, (handle) => {
            expect(getPlatform()).toBe(handle.platform);
        });
        expect(() => getPlatform()).toThrow(/before setPlatform/);
    });

    it('applies capability overrides', async () => {
        await withFakePlatform({ durableStorage: 'full' }, (handle) => {
            expect(handle.platform.capabilities.durableStorage).toBe('full');
        });
    });

    it('seeds a downstream example: a cors-or-network reply lands in Spektrum state (Feature 03.10.8)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            const url = 'https://provider.example/get.php';
            http.onGet(url).reply({ kind: 'cors-or-network', crossOrigin: true, offlineHint: false });

            await hypotheticalImportCall(url);
            tick();

            expect(appState['import']).toMatchObject({
                lastError: { kind: 'cors-or-network', crossOrigin: true, offlineHint: false },
            });
        });
    });
});

/** Feature 03.10.8 downstream-usage example: any real import flow follows this shape — call through getPlatform().http, branch on `kind`, never touch fetch directly. */
async function hypotheticalImportCall(url: string): Promise<void> {
    const result = await getPlatform().http.get(url);
    setValue('import.lastError', result.kind === 'ok' ? null : result);
}
