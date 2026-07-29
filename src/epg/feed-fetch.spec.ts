import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { EpgCountry } from './countries';
import { fetchCountryFeeds } from './feed-fetch';

const NL: EpgCountry = {
    folder: 'Netherlands',
    filePrefix: 'netherlands',
    fileCount: 2,
    suffix: 'nl',
    iso2: 'NL',
    name: 'Netherlands',
    kind: 'country',
};

const GZ_URL_1 = 'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands1.xml.gz';
const GZ_URL_2 = 'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands2.xml.gz';
const PLAIN_URL_1 = 'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands1.xml';
const PLAIN_URL_2 = 'https://raw.githubusercontent.com/globetvapp/epg/main/Netherlands/netherlands2.xml';

/** Every orchestration-level test disables gzip support, so `fetchCountryFeeds` takes the plain-URL fallback (Feature 31.2.3) — `FakeHttpAdapter` only supports string bodies, and real gzip bytes don't survive that round-trip. Actual gzip decoding is covered separately, directly against `CompressionStream`-produced bytes. */
beforeEach(() => {
    vi.stubGlobal('DecompressionStream', undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fetchCountryFeeds — plain-URL orchestration (gzip unavailable)', () => {
    it('fetches every file for the country, in order', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: '<tv>one</tv>' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: '<tv>two</tv>' });

            const result = await fetchCountryFeeds(NL);

            expect(result.files.map((f) => f.url)).toEqual([PLAIN_URL_1, PLAIN_URL_2]);
            expect(result.files.map((f) => f.outcome)).toEqual(['fetched', 'fetched']);
            expect(result.files[0]?.text).toBe('<tv>one</tv>');
        });
    });

    it('requests are sequential and spaced at least 300ms apart, never parallel', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: '<tv>one</tv>' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: '<tv>two</tv>' });

            const start = Date.now();
            await fetchCountryFeeds(NL, { force: true });
            const elapsed = Date.now() - start;

            expect(http.calls.map((c) => c.url)).toEqual([PLAIN_URL_1, PLAIN_URL_2]);
            expect(elapsed).toBeGreaterThanOrEqual(300);
        });
    });

    it('sends If-None-Match on a refetch once an ETag is known, and a 304 skips re-parsing', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: 'v1', headers: { etag: '"abc"' } });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });
            await fetchCountryFeeds(NL, { force: true });

            http.onGet(PLAIN_URL_1).reply({ kind: 'http', status: 304 });
            await storage.set(
                `epg.feed.meta.${PLAIN_URL_1}`,
                Object.assign({}, await storage.get(`epg.feed.meta.${PLAIN_URL_1}`), { lastFetchedAt: 0 }),
            );

            const result = await fetchCountryFeeds(NL, { force: true });
            expect(result.files[0]).toMatchObject({ outcome: 'not-modified' });
            expect(http.calls[2]?.options?.headers).toMatchObject({ 'If-None-Match': '"abc"' });
        });
    });

    it('TTL: a second call inside the refresh window makes no HTTP requests at all', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: 'v1' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });
            await fetchCountryFeeds(NL, { force: true });
            const callsAfterFirst = http.calls.length;

            const second = await fetchCountryFeeds(NL);
            expect(http.calls).toHaveLength(callsAfterFirst);
            expect(second.files.every((f) => f.outcome === 'skipped-fresh')).toBe(true);
        });
    });

    it('force bypasses the TTL', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: 'v1' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });
            await storage.set(`epg.feed.meta.${PLAIN_URL_1}`, { etag: null, lastFetchedAt: Date.now() });
            await storage.set(`epg.feed.meta.${PLAIN_URL_2}`, { etag: null, lastFetchedAt: Date.now() });

            const result = await fetchCountryFeeds(NL, { force: true });
            expect(result.files.every((f) => f.outcome === 'fetched')).toBe(true);
        });
    });

    it('a failing file does not block the other, and is classified rather than thrown', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'http', status: 500 });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });

            const result = await fetchCountryFeeds(NL, { force: true });
            expect(result.files[0]).toMatchObject({ outcome: 'failed', failure: { kind: 'http', status: 500 } });
            expect(result.files[1]).toMatchObject({ outcome: 'fetched' });
        });
    });

    it('a failure is also bookkept, so it backs off until the next TTL window instead of retrying every reload', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'http', status: 500 });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });
            await fetchCountryFeeds(NL, { force: true });
            const callsAfterFirst = http.calls.length;

            const second = await fetchCountryFeeds(NL);
            expect(http.calls).toHaveLength(callsAfterFirst);
            expect(second.files[0]).toMatchObject({ outcome: 'skipped-fresh' });
        });
    });

    it('single-flight: two concurrent calls for the same country share one fetch', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: 'v1' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });

            const [a, b] = await Promise.all([fetchCountryFeeds(NL, { force: true }), fetchCountryFeeds(NL, { force: true })]);

            expect(a).toBe(b);
            // Two files fetched once, not twice — the second call reused the first's in-flight promise.
            expect(http.calls).toHaveLength(2);
        });
    });

    it('a call for a different country after the first resolves is not deduped', async () => {
        await withFakePlatform({}, async ({ http }) => {
            const UK: EpgCountry = { ...NL, folder: 'Unitedkingdom', filePrefix: 'unitedkingdom', suffix: 'uk', iso2: 'GB', fileCount: 1 };
            http.onGet(PLAIN_URL_1).reply({ kind: 'ok', body: 'v1' });
            http.onGet(PLAIN_URL_2).reply({ kind: 'ok', body: 'v2' });
            http.onGet('https://raw.githubusercontent.com/globetvapp/epg/main/Unitedkingdom/unitedkingdom1.xml').reply({
                kind: 'ok',
                body: 'uk',
            });

            const nl = await fetchCountryFeeds(NL, { force: true });
            const uk = await fetchCountryFeeds(UK, { force: true });
            expect(nl.country).toBe('Netherlands');
            expect(uk.country).toBe('Unitedkingdom');
        });
    });
});

describe('gzip decoding', () => {
    it('a real gzip payload (magic bytes + DecompressionStream) round-trips to the original text', async () => {
        vi.unstubAllGlobals();
        const original = '<tv><channel id="24 Kitchen.nl"/></tv>';
        const gz = await gzipText(original);
        const head = new Uint8Array(gz, 0, 2);
        expect(head[0]).toBe(0x1f);
        expect(head[1]).toBe(0x8b);

        await withFakePlatform({}, async ({ http }) => {
            // FakeHttpAdapter only carries string bodies — swap in the real
            // gzip ArrayBuffer for this one call by overriding `get()`
            // directly rather than the scripted-route table.
            const originalGet = http.get.bind(http);
            http.get = async (url, options) => {
                if (url !== GZ_URL_1) return originalGet(url, options);
                return { kind: 'ok', res: new Response(gz), etag: null, lastModified: null };
            };
            http.onGet(GZ_URL_2).reply({ kind: 'ok', body: '<tv/>' });

            const result = await fetchCountryFeeds(NL, { force: true });
            expect(result.files[0]).toMatchObject({ outcome: 'fetched', text: original });
        });
    });
});

async function gzipText(text: string): Promise<ArrayBuffer> {
    const stream = new Response(text).body!.pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
}
