import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { getMappingSync, resetMappingCacheForTests } from '../epg/match';
import { allHealthRecords, observe, primeHealthCache, resetHealthCacheForTests } from '../health/store';
import { blockAuthor } from './blocklist';
import { buildCodex } from './build';
import type { CodexDocument } from './format';
import { addSubscription, listSubscriptions, rebuildFromLibrary, refreshSubscriptions, removeSubscription } from './library';
import { loadOrCreateIdentity } from './signing';

const URL_A = 'http://p.example/live/bob/hunter2/1.ts';
const CODEX_URL = 'https://someone.example/codex.json';
const OTHER_URL = 'https://elsewhere.example/codex.json';

afterEach(() => {
    resetHealthCacheForTests();
    resetMappingCacheForTests();
});

/** Builds a signed Codex on a throwaway device, so the fixture is a genuine document rather than a hand-written object. */
async function publishedCodex(seed: () => Promise<void> | void): Promise<CodexDocument> {
    let document: CodexDocument | undefined;
    await withFakePlatform({}, async ({ storage }) => {
        void storage;
        await seed();
        document = await buildCodex(['NL']);
    });
    resetHealthCacheForTests();
    resetMappingCacheForTests();
    return document!;
}

function serve(http: FakeHttpAdapter, url: string, document: CodexDocument, etag = 'v1'): void {
    http.onGet(url).reply({ kind: 'ok', body: JSON.stringify(document), headers: { etag } });
}

describe('following a shared Codex', () => {
    it('fetches, verifies and applies it in one step', async () => {
        const shared = await publishedCodex(async () => {
            await mapping('NPO 1', 'NPO 1.nl');
            observe(URL_A, 'ok', 400);
            await Promise.resolve();
        });

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared);
            const result = await addSubscription(CODEX_URL);

            expect(result.ok).toBe(true);
            expect(result.authorId).toBe(shared.body.author.id);
            expect(getMappingSync('NL').map((match) => match.catalogId)).toEqual(['NPO 1.nl']);
            expect(await listSubscriptions()).toHaveLength(1);
        });
    });

    it('refuses a URL that does not serve a Codex, and does not record a subscription', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(CODEX_URL).reply({ kind: 'ok', body: '{"hello":"world"}' });
            expect(await addSubscription(CODEX_URL)).toMatchObject({ ok: false, problem: 'not-a-codex' });
            expect(await listSubscriptions()).toEqual([]);
        });
    });

    it('refuses an unreachable URL', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(CODEX_URL).reply({ kind: 'timeout' });
            expect(await addSubscription(CODEX_URL)).toMatchObject({ ok: false, problem: 'unreachable' });
        });
    });
});

describe('refreshing', () => {
    it('makes no upstream request inside the TTL, and sends the ETag when it does', async () => {
        const shared = await publishedCodex(() => mapping('NPO 1', 'NPO 1.nl'));

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared, 'etag-1');
            await addSubscription(CODEX_URL);
            const afterAdd = http.calls.length;

            const quiet = await refreshSubscriptions();
            expect(quiet.results[0]?.outcome).toBe('skipped-fresh');
            expect(http.calls).toHaveLength(afterAdd);

            await refreshSubscriptions({ force: true });
            expect(http.calls.at(-1)?.options?.headers).toMatchObject({ 'If-None-Match': 'etag-1' });
        });
    });

    it('treats 304 as "nothing changed" rather than as a failure', async () => {
        const shared = await publishedCodex(() => mapping('NPO 1', 'NPO 1.nl'));

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared, 'etag-1');
            await addSubscription(CODEX_URL);

            http.onGet(CODEX_URL).reply({ kind: 'http', status: 304 });
            const summary = await refreshSubscriptions({ force: true });
            expect(summary.results[0]?.outcome).toBe('not-modified');
            expect((await listSubscriptions())[0]?.lastProblem).toBeNull();
        });
    });

    it('records why a fetch failed without dropping the subscription', async () => {
        const shared = await publishedCodex(() => mapping('NPO 1', 'NPO 1.nl'));

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared);
            await addSubscription(CODEX_URL);

            http.onGet(CODEX_URL).reply({ kind: 'cors-or-network' });
            await refreshSubscriptions({ force: true });

            const [subscription] = await listSubscriptions();
            expect(subscription?.lastProblem).toBe('unreachable');
            // Still followed: a host having a bad day is not a reason to
            // silently forget what the user chose.
            expect(subscription?.url).toBe(CODEX_URL);
        });
    });
});

describe('pruning a contributor', () => {
    it('removes their contribution exactly, by rebuilding from the retained files', async () => {
        const honest = await publishedCodex(async () => {
            observe(URL_A, 'ok', 400);
            await Promise.resolve();
        });
        const liar = await publishedCodex(async () => {
            observe(URL_A, 'failed');
            observe(URL_A, 'failed');
            observe(URL_A, 'failed');
            await Promise.resolve();
        });

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, honest);
            serve(http, OTHER_URL, liar);
            await addSubscription(CODEX_URL);
            await addSubscription(OTHER_URL);
            await primeHealthCache();

            const poisoned = allHealthRecords()[0]!;
            expect(poisoned.failWeight).toBeGreaterThan(0);

            await blockAuthor(liar.body.author.id);
            await rebuildFromLibrary();

            const cleaned = allHealthRecords()[0]!;
            // The point of retaining the documents: a `max`-joined weight
            // cannot be run backwards, but re-folding the survivors can.
            expect(cleaned.failWeight).toBe(0);
            expect(cleaned.okWeight).toBeGreaterThan(0);
        });
    });

    it('keeps this device\'s own evidence through a rebuild', async () => {
        const shared = await publishedCodex(async () => {
            observe(URL_A, 'failed');
            await Promise.resolve();
        });

        await withFakePlatform({}, async ({ http }) => {
            observe(URL_A, 'ok', 300);
            observe(URL_A, 'ok', 300);
            await Promise.resolve();

            serve(http, CODEX_URL, shared);
            await addSubscription(CODEX_URL);

            await blockAuthor(shared.body.author.id);
            await rebuildFromLibrary();
            await primeHealthCache();

            const record = allHealthRecords()[0]!;
            // Both local 'ok' observations survived the rebuild. Not an exact
            // `2`: the score decays against wall-clock time, so a slow run of
            // the whole suite lands on 1.9999999988 and an exact/`>=`
            // comparison fails intermittently. The claim is "neither
            // observation was lost", which the tolerance states honestly.
            expect(record.okWeight).toBeGreaterThan(1.99);
            expect(record.failWeight).toBe(0);
        });
    });

    it('unfollowing also takes the contribution back', async () => {
        const shared = await publishedCodex(async () => {
            observe(URL_A, 'failed');
            await Promise.resolve();
        });

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared);
            await addSubscription(CODEX_URL);
            await primeHealthCache();
            expect(allHealthRecords()[0]?.failWeight).toBeGreaterThan(0);

            await removeSubscription(CODEX_URL);
            await primeHealthCache();
            expect(allHealthRecords()[0]?.failWeight).toBe(0);
            expect(await listSubscriptions()).toEqual([]);
        });
    });

    it('drops mappings that only the pruned author ever claimed', async () => {
        const shared = await publishedCodex(() => mapping('NPO 1', 'NPO 1.nl'));

        await withFakePlatform({}, async ({ http }) => {
            serve(http, CODEX_URL, shared);
            await addSubscription(CODEX_URL);
            expect(getMappingSync('NL')).toHaveLength(1);

            await blockAuthor(shared.body.author.id);
            await rebuildFromLibrary();
            // Nothing local ever claimed this channel, so nothing survives —
            // which is exactly "as if that Codex had never been fetched".
            expect(getMappingSync('NL')).toEqual([]);
        });
    });
});

describe('a device with an identity of its own', () => {
    it('does not attribute imported claims to itself', async () => {
        const shared = await publishedCodex(async () => {
            observe(URL_A, 'ok', 400);
            await Promise.resolve();
        });

        await withFakePlatform({}, async ({ http }) => {
            const me = await loadOrCreateIdentity();
            serve(http, CODEX_URL, shared);
            await addSubscription(CODEX_URL);
            await primeHealthCache();

            const authors = allHealthRecords()[0]?.authors ?? [];
            expect(authors).toContain(shared.body.author.id);
            expect(authors).not.toContain(me.author.id);
        });
    });
});

async function mapping(channelKey: string, catalogId: string): Promise<void> {
    const { getPlatform } = await import('../core/platform');
    await getPlatform().storage.set('epg.mapping.NL', {
        savedAt: 1_000,
        matches: [{ channelKey, catalogId, method: 'name' }],
    });
}
