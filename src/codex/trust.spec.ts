import { describe, expect, it } from 'vitest';
import type { CodexBody, CodexHealthClaim, CodexIdentityClaim } from './format';
import { EMPTY_KNOWLEDGE, mergeKnowledge } from './merge';
import { REMOTE_WEIGHT_CEILING, trustedKnowledge } from './trust';

const NOW = 1_700_000_000_000;

function body(authorId: string, claims: { identity?: CodexIdentityClaim[]; health?: CodexHealthClaim[] } = {}): CodexBody {
    return {
        format: 1,
        generatedAt: NOW,
        generator: 'ThunderTV',
        author: { id: authorId, publicKey: {} },
        identity: claims.identity ?? [],
        health: claims.health ?? [],
    };
}

function health(over: Partial<CodexHealthClaim> = {}): CodexHealthClaim {
    return { streamKey: 's1', okWeight: 1, failWeight: 0, ttffMs: 500, observedAt: NOW - 1000, ...over };
}

const policy = { blocked: new Set<string>(), nowMs: NOW };

describe('the weight ceiling', () => {
    it('caps what a single remote claim can assert', () => {
        const knowledge = trustedKnowledge(body('them', { health: [health({ okWeight: 1e9, failWeight: 1e9 })] }), policy);
        expect(knowledge.health[0]).toMatchObject({ okWeight: REMOTE_WEIGHT_CEILING, failWeight: REMOTE_WEIGHT_CEILING });
    });

    it('leaves an honest claim untouched — the ceiling is a bound, not a rescale', () => {
        const knowledge = trustedKnowledge(body('them', { health: [health({ okWeight: 2, failWeight: 1 })] }), policy);
        expect(knowledge.health[0]).toMatchObject({ okWeight: 2, failWeight: 1 });
    });

    it('cannot talk a feed the user has actually watched into looking dead', () => {
        // The property that matters: your own experience outweighs a
        // stranger's assertion about the same feed. `src/health/score.ts`
        // reads ok/(ok+fail), and LIKELY_DEAD_BELOW is 0.35.
        const mine = { identity: [], health: [{ ...health({ okWeight: 12, failWeight: 0 }), authors: ['local'] }] };
        const attack = trustedKnowledge(body('liar', { health: [health({ okWeight: 0, failWeight: 1e6 })] }), policy);

        const merged = mergeKnowledge(mine, attack).health[0]!;
        const score = merged.okWeight / (merged.okWeight + merged.failWeight);
        expect(score).toBeGreaterThan(0.35);
    });

    it('still lets a stranger speak for a feed the user has never tried', () => {
        // The stranger test: bounded influence must not mean no influence.
        const attack = trustedKnowledge(body('them', { health: [health({ okWeight: 0, failWeight: 3 })] }), policy);
        const merged = mergeKnowledge(EMPTY_KNOWLEDGE, attack).health[0]!;
        expect(merged.okWeight / (merged.okWeight + merged.failWeight)).toBe(0);
    });
});

describe('rejecting impossible values', () => {
    it('refuses a claim dated in the future, which would freeze a record\'s decay forever', () => {
        const knowledge = trustedKnowledge(body('them', { health: [health({ observedAt: NOW + 10 ** 12 })] }), policy);
        expect(knowledge.health[0]!.observedAt).toBe(NOW);
    });

    it('drops a NaN or negative weight rather than propagating it into arithmetic', () => {
        const knowledge = trustedKnowledge(body('them', { health: [health({ okWeight: Number.NaN, failWeight: -5 })] }), policy);
        expect(knowledge.health[0]).toMatchObject({ okWeight: 0, failWeight: 0 });
    });

    it('drops an impossible startup time to null rather than clamping it to a lie', () => {
        expect(trustedKnowledge(body('them', { health: [health({ ttffMs: -1 })] }), policy).health[0]!.ttffMs).toBeNull();
        expect(trustedKnowledge(body('them', { health: [health({ ttffMs: Number.POSITIVE_INFINITY })] }), policy).health[0]!.ttffMs).toBeNull();
    });

    it('clamps a future identity observation too', () => {
        const claim = { country: 'nl', channelKey: 'npo1', catalogId: 'x.nl', method: 'name', observedAt: NOW * 4 };
        const knowledge = trustedKnowledge(body('them', { identity: [claim] }), policy);
        expect(knowledge.identity[0]!.observedAt).toBe(NOW);
    });
});

describe('the blocklist', () => {
    it('yields nothing at all for a blocked author', () => {
        const blocked = { blocked: new Set(['liar']), nowMs: NOW };
        const knowledge = trustedKnowledge(body('liar', { health: [health()] }), blocked);
        expect(knowledge).toEqual(EMPTY_KNOWLEDGE);
    });

    it('does not touch anyone else', () => {
        const blocked = { blocked: new Set(['liar']), nowMs: NOW };
        expect(trustedKnowledge(body('honest', { health: [health()] }), blocked).health).toHaveLength(1);
    });
});

describe('the clamp is applied before the join, not inside it', () => {
    it('leaves merging associative, which is what makes a rebuild exact', () => {
        const a = trustedKnowledge(body('a', { health: [health({ okWeight: 9, observedAt: NOW - 3 })] }), policy);
        const b = trustedKnowledge(body('b', { health: [health({ okWeight: 2, observedAt: NOW - 2 })] }), policy);
        const c = trustedKnowledge(body('c', { health: [health({ okWeight: 5, observedAt: NOW - 1 })] }), policy);

        expect(mergeKnowledge(mergeKnowledge(a, b), c)).toEqual(mergeKnowledge(a, mergeKnowledge(b, c)));
    });
});
