import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { clearRows } from './channel-memory';
import { importPlaylistFile, importPlaylistText, importPlaylistUrl, redactPlaylistUrl } from './import';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';

describe('importPlaylistFile (Feature 07.2)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('imports a valid file end to end', async () => {
        await withFakePlatform({}, async () => {
            const outcome = await importPlaylistFile(new File([SAMPLE], 'list.m3u'));
            expect(outcome.ok).toBe(true);
        });
    });

    it('rejects non-M3U content with a friendly message instead of a generic failure', async () => {
        await withFakePlatform({}, async () => {
            const outcome = await importPlaylistFile(new File(['<html>404</html>'], 'list.m3u'));
            expect(outcome).toMatchObject({ ok: false, cancelled: false, errorKind: 'invalidM3u' });
        });
    });

    it('warns instead of silently deduping an identical re-upload (Feature 07.7.6)', async () => {
        await withFakePlatform({}, async () => {
            const first = await importPlaylistFile(new File([SAMPLE], 'list.m3u'));
            expect(first.ok).toBe(true);

            const second = await importPlaylistFile(new File([SAMPLE], 'list-copy.m3u'));
            expect(second).toMatchObject({ ok: false, duplicate: { name: 'list.m3u' } });
        });
    });

    it('allowDuplicate bypasses the fingerprint warning and imports anyway', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await importPlaylistFile(new File([SAMPLE], 'list.m3u'));
            const second = await importPlaylistFile(new File([SAMPLE], 'list-copy.m3u'), { allowDuplicate: true });

            expect(second.ok).toBe(true);
            expect(await storage.count('playlists')).toBe(2);
        });
    });
});

describe('importPlaylistText (Feature 07.3)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('imports pasted text with the default "Pasted playlist" name', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const outcome = await importPlaylistText(SAMPLE);
            expect(outcome.ok).toBe(true);
            const [record] = await storage.getAll('playlists');
            expect(record?.name).toBe('Pasted playlist');
            expect(record?.type).toBe('m3u-text');
        });
    });

    it('rejects text that does not look like a playlist, keeping the original message distinct from a network error', async () => {
        await withFakePlatform({}, async () => {
            const outcome = await importPlaylistText('{"not":"m3u"}');
            expect(outcome).toMatchObject({ ok: false, cancelled: false, errorKind: 'invalidM3u' });
        });
    });
});

describe('importPlaylistUrl (Feature 07.4)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('imports successfully and captures etag/lastModified (Feature 07.4.7)', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet('https://example.com/list.m3u').reply({
                kind: 'ok',
                body: SAMPLE,
                headers: { etag: 'W/"abc"', 'last-modified': 'Tue, 01 Jan 2030 00:00:00 GMT' },
            });

            const outcome = await importPlaylistUrl('https://example.com/list.m3u');
            expect(outcome.ok).toBe(true);
            const [record] = await storage.getAll('playlists');
            expect(record?.etag).toBe('W/"abc"');
            expect(record?.lastModified).toBe('Tue, 01 Jan 2030 00:00:00 GMT');
        });
    });

    it('classifies a 404 as httpNotFound, distinct from other HTTP failures (Feature 07.4.3)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://example.com/missing.m3u').reply({ kind: 'http', status: 404 });
            const outcome = await importPlaylistUrl('https://example.com/missing.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'httpNotFound' });
        });
    });

    it('classifies 401/403 as httpAuth, distinct from a 404', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://example.com/private.m3u').reply({ kind: 'http', status: 401 });
            const outcome = await importPlaylistUrl('https://example.com/private.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'httpAuth' });
        });
    });

    it('classifies 5xx as httpServer', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://example.com/down.m3u').reply({ kind: 'http', status: 503 });
            const outcome = await importPlaylistUrl('https://example.com/down.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'httpServer' });
        });
    });

    it('classifies a cross-origin CORS-or-network failure distinctly (Feature 07.4.2)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://blocked.example.com/list.m3u').reply({ kind: 'cors-or-network', crossOrigin: true });
            const outcome = await importPlaylistUrl('https://blocked.example.com/list.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'corsOrNetwork' });
        });
    });

    it('classifies an offline hint distinctly from a plain CORS/network failure', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://example.com/list.m3u').reply({ kind: 'cors-or-network', offlineHint: true });
            const outcome = await importPlaylistUrl('https://example.com/list.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'offline' });
        });
    });

    it('classifies a timeout distinctly', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://slow.example.com/list.m3u').reply({ kind: 'timeout' });
            const outcome = await importPlaylistUrl('https://slow.example.com/list.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'timeout' });
        });
    });

    it('detects mixed content (http:// URL from an https:// page) before ever fetching (Feature 07.4.5)', async () => {
        vi.stubGlobal('location', { ...location, protocol: 'https:' });
        try {
            await withFakePlatform({}, async ({ http }) => {
                const outcome = await importPlaylistUrl('http://insecure.example.com/list.m3u');
                expect(outcome).toMatchObject({ ok: false, errorKind: 'mixedContent' });
                expect(http.calls).toHaveLength(0);
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('defaults the source name from the URL filename (Feature 07.4.6)', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet('https://example.com/path/my-list.m3u').reply({ kind: 'ok', body: SAMPLE });
            await importPlaylistUrl('https://example.com/path/my-list.m3u');
            const [record] = await storage.getAll('playlists');
            expect(record?.name).toBe('my-list.m3u');
        });
    });

    it('never trusts Content-Type — an HTML error page served as text/html is still sniffed and rejected (Feature 07.4.8)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet('https://example.com/list.m3u').reply({
                kind: 'ok',
                body: '<html><body>Service unavailable</body></html>',
                headers: { 'content-type': 'text/html' },
            });
            const outcome = await importPlaylistUrl('https://example.com/list.m3u');
            expect(outcome).toMatchObject({ ok: false, errorKind: 'invalidM3u' });
        });
    });
});

describe('redactPlaylistUrl', () => {
    it('strips userinfo and credential-shaped query params', () => {
        const url = redactPlaylistUrl('https://bob:p@ss@example.com/get.php?username=bob&password=p%40ss&type=m3u');
        expect(url).not.toContain('bob');
        expect(url).not.toContain('p%40ss');
        expect(url).not.toContain('p@ss');
        expect(url).toBe('https://example.com/get.php?username=REDACTED&password=REDACTED&type=m3u');
    });

    it('falls back to a placeholder for an unparseable URL rather than leaking the input', () => {
        expect(redactPlaylistUrl('::not a url::')).toBe('[unparseable url redacted]');
    });

    it('leaves a URL with no credential-shaped parts unchanged', () => {
        expect(redactPlaylistUrl('https://example.com/list.m3u')).toBe('https://example.com/list.m3u');
    });
});
