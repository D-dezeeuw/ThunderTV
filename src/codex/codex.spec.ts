import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { observe, primeHealthCache, resetHealthCacheForTests } from '../health/store';
import { importCodex } from './apply';
import { buildCodex } from './build';
import { canonicalize, isCodexDocument, type CodexDocument } from './format';
import { fingerprint, loadOrCreateIdentity, verifyDocument } from './signing';

const URL_A = 'http://p.example/live/bob/hunter2/1.ts';
const URL_B = 'http://p.example/live/bob/hunter2/2.ts';

afterEach(() => {
    resetHealthCacheForTests();
});

/** Seeds one country mapping plus some health, then exports. */
async function seedAndBuild(storage: { set: (k: string, v: unknown) => unknown }): Promise<CodexDocument> {
    await storage.set('epg.mapping.NL', {
        savedAt: 1_000,
        matches: [{ channelKey: 'NPO 1', catalogId: 'NPO 1.nl', method: 'name' }],
    });
    observe(URL_A, 'ok', 400);
    observe(URL_B, 'failed');
    return buildCodex(['NL']);
}

describe('canonicalize', () => {
    it('is insensitive to key insertion order, so two devices sign identical bytes', () => {
        expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
    });

    it('preserves array order, which the builder has already made deterministic', () => {
        expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    });
});

describe('building a Codex', () => {
    it('round-trips: what is exported verifies, and re-imports into an empty device', async () => {
        let exported: CodexDocument | undefined;

        await withFakePlatform({}, async ({ storage }) => {
            exported = await seedAndBuild(storage);
            expect(await verifyDocument(exported)).toBe(true);
        });

        resetHealthCacheForTests();

        await withFakePlatform({}, async ({ storage }) => {
            const result = await importCodex(JSON.stringify(exported));
            expect(result.ok).toBe(true);
            expect(result.identityApplied).toBe(1);
            expect(result.healthApplied).toBe(2);

            const mapping = await storage.get<{ matches: { catalogId: string }[] }>('epg.mapping.NL');
            expect(mapping?.matches[0]?.catalogId).toBe('NPO 1.nl');
            expect(await storage.getAll('streamHealth')).toHaveLength(2);
        });
    });

    it('never contains a credential, even though the health it describes came from credentialed URLs', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const document = await seedAndBuild(storage);
            const serialized = JSON.stringify(document);
            expect(serialized).not.toContain('bob');
            expect(serialized).not.toContain('hunter2');
            // ...and the feeds are still individually identified.
            expect(document.body.health).toHaveLength(2);
        });
    });

    it('is human-readable JSON with the claims sorted deterministically', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const a = await seedAndBuild(storage);
            const b = await buildCodex(['NL']);
            expect(a.body.health.map((c) => c.streamKey)).toEqual(b.body.health.map((c) => c.streamKey));
            expect([...a.body.health.map((c) => c.streamKey)]).toEqual(
                [...a.body.health.map((c) => c.streamKey)].sort(),
            );
        });
    });

    it('reuses the same author identity across exports, so a recipient can recognise the source', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const first = await seedAndBuild(storage);
            const second = await buildCodex(['NL']);
            expect(second.body.author.id).toBe(first.body.author.id);
            expect(first.body.author.id).toBe(await fingerprint(first.body.author.publicKey));
        });
    });

    it('never puts the private key in the document', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const document = await seedAndBuild(storage);
            // A JWK private key carries a `d` parameter; the public one does not.
            expect(document.body.author.publicKey.d).toBeUndefined();
            expect(JSON.stringify(document)).not.toContain('"d"');
        });
    });
});

describe('importing a Codex', () => {
    it('rejects a tampered body, even though the signature itself is untouched', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const document = await seedAndBuild(storage);
            const tampered: CodexDocument = {
                ...document,
                body: {
                    ...document.body,
                    identity: [{ ...document.body.identity[0]!, catalogId: 'ATTACKER.nl' }],
                },
            };
            const result = await importCodex(JSON.stringify(tampered));
            expect(result.ok).toBe(false);
            expect(result.problem).toBe('bad-signature');
        });
    });

    it('rejects a document signed by a different key than the one it carries', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const document = await seedAndBuild(storage);
            // Swap in a fresh, unrelated public key.
            await storage.set('codex.identity.privateKey', undefined);
            await storage.set('codex.identity.publicKey', undefined);
            const other = await loadOrCreateIdentity();
            const swapped: CodexDocument = {
                ...document,
                body: { ...document.body, author: other.author },
            };
            expect(await verifyDocument(swapped)).toBe(false);
        });
    });

    it('classifies a non-JSON file and a non-Codex JSON file distinctly', async () => {
        await withFakePlatform({}, async () => {
            expect((await importCodex('not json at all')).problem).toBe('not-json');
            expect((await importCodex('{"hello":"world"}')).problem).toBe('not-a-codex');
        });
    });

    it('merges health rather than overwriting it — two people\'s evidence is more evidence', async () => {
        let exported: CodexDocument | undefined;
        await withFakePlatform({}, async ({ storage }) => {
            observe(URL_A, 'ok', 400);
            observe(URL_A, 'ok', 400);
            exported = await buildCodex([]);
            void storage;
        });

        resetHealthCacheForTests();

        await withFakePlatform({}, async () => {
            // This device only ever saw one success for the same feed.
            observe(URL_A, 'ok', 900);
            await Promise.resolve();
            await importCodex(JSON.stringify(exported));
            await primeHealthCache();

            const { allHealthRecords } = await import('../health/store');
            const record = allHealthRecords().find((r) => r.key.endsWith('/1.ts'));
            // Took the stronger of the two, not the local one.
            expect(record?.okWeight).toBeGreaterThan(1);
        });
    });

    it('does not let an older imported mapping undo a newer local one', async () => {
        let exported: CodexDocument | undefined;
        await withFakePlatform({}, async ({ storage }) => {
            await storage.set('epg.mapping.NL', {
                savedAt: 1_000,
                matches: [{ channelKey: 'NPO 1', catalogId: 'OLD.nl', method: 'name' }],
            });
            exported = await buildCodex(['NL']);
        });

        await withFakePlatform({}, async ({ storage }) => {
            await storage.set('epg.mapping.NL', {
                savedAt: 9_999_999,
                matches: [{ channelKey: 'NPO 1', catalogId: 'NEWER-LOCAL.nl', method: 'tvg-id' }],
            });
            await importCodex(JSON.stringify(exported));

            const mapping = await storage.get<{ matches: { catalogId: string }[] }>('epg.mapping.NL');
            expect(mapping?.matches[0]?.catalogId).toBe('NEWER-LOCAL.nl');
        });
    });
});

describe('isCodexDocument', () => {
    it('accepts a real document and rejects near-misses', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            expect(isCodexDocument(await seedAndBuild(storage))).toBe(true);
        });
        expect(isCodexDocument(null)).toBe(false);
        expect(isCodexDocument({ body: {}, signature: 'x' })).toBe(false);
        expect(isCodexDocument({ signature: 'x' })).toBe(false);
    });
});
