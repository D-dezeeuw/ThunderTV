import type { CodexBody } from './format';
import { EMPTY_KNOWLEDGE, attributeBody, type MergedKnowledge } from './merge';

/**
 * Deciding how much of a stranger's Codex to believe — the half of stone 10
 * the vision calls "a trust model that resists poisoning without a central
 * authority".
 *
 * ## The vector Phase 36 opened
 *
 * The CRDT join is grow-only: health weights merge with `max`, and nothing
 * is ever erased. That is exactly right between people who trust each other
 * and exactly wrong on a Codex published to strangers. A hostile file can
 * simply claim `failWeight: 1e9` for every feed of a competitor's provider,
 * and because `max` never goes down, `pruneAuthors()` cannot take it back —
 * the poisoned value is indistinguishable from evidence in the merged
 * number. Signature verification does not help: the file is *authentically*
 * signed by a liar.
 *
 * There is a second, quieter version. `src/health/score.ts` decays weights
 * relative to `updatedAt`, and the join takes `max(observedAt)`. A claim
 * dated in the year 3000 therefore pins a record's decay baseline forever,
 * freezing whatever it asserted.
 *
 * ## What actually defends against it
 *
 * **Clamp on ingest, never in the join.** Every limit here is applied while
 * turning a document into knowledge, before `mergeKnowledge` sees it. The
 * join stays a pure lattice — commutative, associative, idempotent — which
 * matters because those laws are what let a device re-merge its library
 * from scratch after a prune and get an exact answer.
 *
 * Three limits, in order of how much work they do:
 *
 * 1. **A weight ceiling on remote claims.** A remote claim may contribute
 *    at most `REMOTE_WEIGHT_CEILING` to either side. Because the score is a
 *    ratio, this bounds a stranger's influence *relative to your own
 *    experience*: a feed you have actually played several times cannot be
 *    talked into looking dead. A feed you have never tried takes their word
 *    for it — which is the stranger test working as intended, not a hole.
 * 2. **No claims from the future.** `observedAt` is clamped to now, so
 *    nobody can freeze a record's decay or win every last-writer-wins tie
 *    forever.
 * 3. **A blocklist.** A blocked author's claims are dropped entirely at
 *    ingest, so a rebuild from the retained library reproduces the state
 *    that device would have had if it had never seen them.
 *
 * ## Why identity needs less defending than health
 *
 * A poisoned *identity* claim is self-healing: the local matcher re-derives
 * the mapping from the EPG catalog on the next refresh and overwrites it
 * with a fresh timestamp. A poisoned *health* claim is not — health is
 * accumulated evidence that cannot be recomputed from anything. That
 * asymmetry is why the ceiling exists for one and not the other.
 */

/**
 * How much a single remote claim may contribute to either weight. Local
 * evidence is never clamped.
 *
 * Three, because `src/health/score.ts` adds 1 per observation with a
 * one-week half-life: a feed the user has actually watched a handful of
 * times this week carries more than this on its own, so their own
 * experience always outranks a stranger's assertion about it — while a feed
 * they have never opened still gets a usable signal from the community.
 */
export const REMOTE_WEIGHT_CEILING = 3;

export interface TrustPolicy {
    /** Author fingerprints whose claims are dropped outright. */
    blocked: ReadonlySet<string>;
    /** Overridable so tests can pin it; production always passes `Date.now()`. */
    nowMs: number;
    ceiling?: number;
}

/** A finite, non-negative number, or `fallback` — an untrusted file may carry `NaN`, `Infinity` or a negative weight, none of which any arithmetic downstream survives. */
function sane(value: number, fallback: number): number {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Turns a verified document into knowledge this device is willing to merge.
 * Returns nothing at all for a blocked author — the caller does not need a
 * special case, and a rebuild that skips them lands on the same state as a
 * device that never fetched them.
 */
export function trustedKnowledge(body: CodexBody, policy: TrustPolicy): MergedKnowledge {
    if (policy.blocked.has(body.author.id)) return EMPTY_KNOWLEDGE;

    const ceiling = policy.ceiling ?? REMOTE_WEIGHT_CEILING;
    const attributed = attributeBody(body);

    return {
        identity: attributed.identity.map((claim) => ({
            ...claim,
            observedAt: Math.min(sane(claim.observedAt, 0), policy.nowMs),
        })),
        health: attributed.health.map((claim) => ({
            ...claim,
            okWeight: Math.min(sane(claim.okWeight, 0), ceiling),
            failWeight: Math.min(sane(claim.failWeight, 0), ceiling),
            // A negative or absurd startup time is dropped rather than
            // clamped: `null` already means "nobody measured one", and that
            // is the honest reading of a value that cannot be true.
            ttffMs: claim.ttffMs !== null && Number.isFinite(claim.ttffMs) && claim.ttffMs >= 0 ? claim.ttffMs : null,
            observedAt: Math.min(sane(claim.observedAt, 0), policy.nowMs),
        })),
    };
}
