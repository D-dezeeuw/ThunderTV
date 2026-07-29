import { describe, expect, it } from 'vitest';
import type { CodexBody } from './format';
import {
    EMPTY_KNOWLEDGE,
    attributeBody,
    compareIdentityClaims,
    joinHealthClaims,
    mergeAll,
    mergeKnowledge,
    pruneAuthors,
    type AttributedHealthClaim,
    type AttributedIdentityClaim,
    type MergedKnowledge,
} from './merge';

/**
 * The three CRDT laws are the whole contract of this module, so they are
 * asserted directly — and against randomised claim sets, not just
 * hand-picked ones. A hand-checked CRDT is a broken CRDT: every real bug
 * found while building this (a comparator that returned 0 for claims naming
 * different catalog ids, a `ttffMs` fallback that was commutative but not
 * associative) survived hand-written examples and died to the randomised
 * sweep below.
 */

function identity(over: Partial<AttributedIdentityClaim> = {}): AttributedIdentityClaim {
    return { country: 'nl', channelKey: 'npo1', catalogId: 'npo1.nl', method: 'name', observedAt: 1000, authorId: 'aa', ...over };
}

function health(over: Partial<AttributedHealthClaim> = {}): AttributedHealthClaim {
    return { streamKey: 's1', okWeight: 1, failWeight: 0, ttffMs: null, observedAt: 1000, authors: ['aa'], ...over };
}

/** Merging against the empty set is the canonical form: sorted, deduplicated, author sets normalized. */
function normalize(knowledge: MergedKnowledge): MergedKnowledge {
    return mergeKnowledge(knowledge, EMPTY_KNOWLEDGE);
}

describe('the CRDT laws', () => {
    // A small, deliberately collision-heavy world: two countries, three
    // channels and three stream keys mean random sets constantly disagree
    // about the same key, which is the only case where convergence is hard.
    const COUNTRIES = ['nl', 'uk'];
    const CHANNELS = ['npo1', 'bbc1', 'rtl4'];
    const CATALOGS = ['npo1.nl', 'bbc-one.uk', 'rtl-4.nl'];
    const METHODS = ['tvg-id', 'name', 'alias', 'some-future-method', 'another-future-method'];
    const STREAMS = ['s1', 's2', 's3'];
    const AUTHORS = ['aa', 'bb', 'cc'];
    // Two timestamps only, so ties — the case a naive comparator gets wrong —
    // are the common case rather than a rarity.
    const TIMES = [1000, 2000];

    /** A seeded LCG: a failing case must be reproducible, which `Math.random` is not. */
    function rng(seed: number): () => number {
        let state = seed >>> 0;
        return () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    function randomKnowledge(next: () => number): MergedKnowledge {
        const pick = <T>(pool: readonly T[]): T => pool[Math.floor(next() * pool.length)]!;
        const identityClaims: AttributedIdentityClaim[] = [];
        for (let i = 0; i < 1 + Math.floor(next() * 4); i++) {
            identityClaims.push({
                country: pick(COUNTRIES),
                channelKey: pick(CHANNELS),
                catalogId: pick(CATALOGS),
                method: pick(METHODS),
                observedAt: pick(TIMES),
                authorId: pick(AUTHORS),
            });
        }
        const healthClaims: AttributedHealthClaim[] = [];
        for (let i = 0; i < 1 + Math.floor(next() * 4); i++) {
            healthClaims.push({
                streamKey: pick(STREAMS),
                okWeight: Math.floor(next() * 5),
                failWeight: Math.floor(next() * 5),
                ttffMs: next() < 0.4 ? null : Math.floor(next() * 3) * 500,
                observedAt: pick(TIMES),
                authors: [pick(AUTHORS)],
            });
        }
        return { identity: identityClaims, health: healthClaims };
    }

    const next = rng(20260729);
    const sets = Array.from({ length: 120 }, () => randomKnowledge(next));

    it('is commutative over randomised claim sets', () => {
        for (let i = 0; i < sets.length - 1; i++) {
            const [a, b] = [sets[i]!, sets[i + 1]!];
            expect(mergeKnowledge(a, b)).toEqual(mergeKnowledge(b, a));
        }
    });

    it('is associative over randomised claim sets', () => {
        for (let i = 0; i < sets.length - 2; i++) {
            const [a, b, c] = [sets[i]!, sets[i + 1]!, sets[i + 2]!];
            expect(mergeKnowledge(mergeKnowledge(a, b), c)).toEqual(mergeKnowledge(a, mergeKnowledge(b, c)));
        }
    });

    it('is idempotent over randomised claim sets', () => {
        for (const set of sets) {
            const once = normalize(set);
            expect(mergeKnowledge(once, once)).toEqual(once);
            // Re-importing the very same Codex must also be a no-op, which is
            // the property that rules out summing evidence.
            expect(mergeKnowledge(once, set)).toEqual(once);
        }
    });

    it('reaches the same state from every import order', () => {
        // The user-facing claim: three people trade Codexes in whatever order
        // they happen to and all three end up agreeing.
        const [a, b, c] = [sets[0]!, sets[1]!, sets[2]!];
        const orders: MergedKnowledge[][] = [
            [a, b, c],
            [a, c, b],
            [b, a, c],
            [b, c, a],
            [c, a, b],
            [c, b, a],
        ];
        const results = orders.map((order) => order.reduce(mergeKnowledge, EMPTY_KNOWLEDGE));
        for (const result of results) expect(result).toEqual(results[0]);
    });
});

describe('identity claims', () => {
    it('prefers the newer observation', () => {
        const older = identity({ catalogId: 'old.nl', observedAt: 1000 });
        const newer = identity({ catalogId: 'new.nl', observedAt: 2000 });
        const merged = mergeKnowledge({ identity: [older], health: [] }, { identity: [newer], health: [] });
        expect(merged.identity).toEqual([newer]);
    });

    it('prefers stronger evidence when two observations are simultaneous', () => {
        const guessed = identity({ catalogId: 'guess.nl', method: 'name' });
        const provided = identity({ catalogId: 'exact.nl', method: 'tvg-id' });
        expect(compareIdentityClaims(provided, guessed)).toBeGreaterThan(0);
    });

    it('ranks a method it does not understand below every one it does', () => {
        const known = identity({ method: 'alias', catalogId: 'a.nl' });
        const unknown = identity({ method: 'invented-by-a-newer-build', catalogId: 'b.nl' });
        expect(compareIdentityClaims(known, unknown)).toBeGreaterThan(0);
    });

    it('never returns 0 for claims that disagree about the catalog id', () => {
        // The bug this rung exists for: identical metadata, different answer.
        // A comparator returning 0 here makes the winner depend on import order.
        const a = identity({ catalogId: 'one.nl' });
        const b = identity({ catalogId: 'two.nl' });
        expect(compareIdentityClaims(a, b)).not.toBe(0);
    });

    it('keeps claims for different channels side by side', () => {
        const nl = identity({ country: 'nl', channelKey: 'npo1' });
        const uk = identity({ country: 'uk', channelKey: 'bbc1' });
        const merged = mergeKnowledge({ identity: [nl], health: [] }, { identity: [uk], health: [] });
        expect(merged.identity).toHaveLength(2);
    });
});

describe('health claims', () => {
    it('takes the maximum of each side rather than summing', () => {
        const mine = health({ okWeight: 3, failWeight: 1 });
        const theirs = health({ okWeight: 2, failWeight: 4, authors: ['bb'] });
        expect(joinHealthClaims(mine, theirs)).toMatchObject({ okWeight: 3, failWeight: 4 });
    });

    it('keeps the fastest measured startup, and tolerates a side with none', () => {
        expect(joinHealthClaims(health({ ttffMs: 900 }), health({ ttffMs: 400 })).ttffMs).toBe(400);
        expect(joinHealthClaims(health({ ttffMs: null }), health({ ttffMs: 400 })).ttffMs).toBe(400);
        expect(joinHealthClaims(health({ ttffMs: null }), health({ ttffMs: null })).ttffMs).toBeNull();
    });

    it('unions the contributing authors instead of picking one', () => {
        const joined = joinHealthClaims(health({ authors: ['cc'] }), health({ authors: ['aa'] }));
        expect(joined.authors).toEqual(['aa', 'cc']);
    });

    it('never ages a record backwards', () => {
        expect(joinHealthClaims(health({ observedAt: 5000 }), health({ observedAt: 1000 })).observedAt).toBe(5000);
    });
});

describe('pruneAuthors', () => {
    it('drops an identity claim outright — its author was its only source', () => {
        const knowledge = normalize({ identity: [identity({ authorId: 'bad' }), identity({ channelKey: 'rtl4', authorId: 'aa' })], health: [] });
        const pruned = pruneAuthors(knowledge, new Set(['bad']));
        expect(pruned.identity.map((claim) => claim.authorId)).toEqual(['aa']);
    });

    it('keeps a health claim others also contributed to, minus the pruned author', () => {
        const shared = joinHealthClaims(health({ authors: ['bad'] }), health({ authors: ['aa'] }));
        const pruned = pruneAuthors({ identity: [], health: [shared] }, new Set(['bad']));
        expect(pruned.health).toHaveLength(1);
        expect(pruned.health[0]!.authors).toEqual(['aa']);
    });

    it('removes a health claim only the pruned author ever made', () => {
        const pruned = pruneAuthors({ identity: [], health: [health({ authors: ['bad'] })] }, new Set(['bad']));
        expect(pruned.health).toEqual([]);
    });

    it('recovers exactly by re-merging the retained Codexes', () => {
        // The documented escape hatch: pruning cannot unwind a `max`-joined
        // weight, but re-merging from scratch is exact — and only works
        // because the merge is associative.
        const good = body('aa', { health: [{ streamKey: 's1', okWeight: 2, failWeight: 0, ttffMs: 800, observedAt: 1000 }] });
        const bad = body('bad', { health: [{ streamKey: 's1', okWeight: 99, failWeight: 0, ttffMs: 10, observedAt: 2000 }] });

        const contaminated = pruneAuthors(mergeAll([good, bad]), new Set(['bad']));
        expect(contaminated.health[0]!.okWeight).toBe(99); // the honest limitation

        const recovered = mergeAll([good]);
        expect(recovered.health[0]).toMatchObject({ okWeight: 2, ttffMs: 800, authors: ['aa'] });
    });
});

describe('attributeBody', () => {
    it('tags every claim with the signer, so provenance survives the merge', () => {
        const attributed = attributeBody(
            body('author-1', {
                identity: [{ country: 'nl', channelKey: 'npo1', catalogId: 'npo1.nl', method: 'tvg-id', observedAt: 1000 }],
                health: [{ streamKey: 's1', okWeight: 1, failWeight: 0, ttffMs: null, observedAt: 1000 }],
            }),
        );
        expect(attributed.identity[0]!.authorId).toBe('author-1');
        expect(attributed.health[0]!.authors).toEqual(['author-1']);
    });
});

function body(authorId: string, claims: Partial<Pick<CodexBody, 'identity' | 'health'>>): CodexBody {
    return {
        format: 1,
        generatedAt: 1000,
        generator: 'ThunderTV',
        author: { id: authorId, publicKey: {} },
        identity: claims.identity ?? [],
        health: claims.health ?? [],
    };
}
