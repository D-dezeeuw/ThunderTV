import type { CodexBody, CodexHealthClaim, CodexIdentityClaim } from './format';
import { identityClaimKey } from './format';

/**
 * Convergent Codex merge — Vision 3.0's stone 6, "the hard half of pillar
 * III", landed in Phase 36.
 *
 * ## What convergence actually requires
 *
 * Phase 34's v0 merge was *newest-wins*, which is not convergent: import
 * order could change the result, so two people who traded Codexes could end
 * up disagreeing. A CRDT fixes that by making the merge function a
 * **join** on a lattice — mathematically, it must be:
 *
 * - **commutative**: `merge(a, b) === merge(b, a)`
 * - **associative**: `merge(merge(a, b), c) === merge(a, merge(b, c))`
 * - **idempotent**: `merge(a, a) === a`
 *
 * Get those three and order stops mattering entirely — every device that
 * has seen the same set of Codexes holds the same state, with no
 * coordination, no server, and no sync protocol. That is the whole
 * mechanism behind "collaborative curation with no collaboration server".
 * All three are asserted directly in `merge.spec.ts`, including against
 * randomised claim sets, because a hand-checked CRDT is a broken CRDT.
 *
 * ## The two lattices
 *
 * **Health is grow-only in every component.** `okWeight`/`failWeight` join
 * with `max`, `observedAt` with `max`, `ttffMs` with "smallest measurement
 * anyone has", and the contributing authors with set union. Nothing is ever
 * erased, which is both trivially a join and the right semantic: two
 * people's independent evidence about a feed is more evidence.
 *
 * It deliberately does not *sum* the weights: summing is neither idempotent
 * (re-importing the same file would inflate it) nor honest (the same person
 * re-sharing their own Codex twice is not twice the evidence).
 *
 * `ttffMs` was the subtle one. The obvious rule — "the newest observation's
 * time, or the other side's if the newest recorded none" — is *not*
 * associative, because the fallback lets a merged value carry a startup
 * time that outranks a genuinely newer null. (Concretely: `a` newest with
 * no measurement, `b` oldest at 10ms, `c` middling at 20ms. Merging `b,c`
 * first yields 20ms; merging `a,b` first yields 10ms, and it sticks.) So
 * `ttffMs` is a plain `min` over the measurements that exist — "the fastest
 * start anyone has seen for this feed", a capability rather than a
 * freshness signal, and a real join.
 *
 * **Identity is a last-writer-wins register**, ordered by
 * `(observedAt, method strength, authorId, catalogId)`. Timestamps alone
 * are not a total order — two devices genuinely can observe at the same
 * millisecond, and clocks disagree — so ties fall through to how *strong*
 * the evidence was (a `tvg-id` match beats a fuzzy name match regardless of
 * who saw it later), then to the author id, and finally to the claimed
 * catalog id. That last rung looks pointless and is not: without it two
 * claims naming *different* catalog ids can compare equal, and "keep the
 * one already in the map" turns the result back into an order-dependent
 * one. A comparator used as a join has to be a total order over the values,
 * not merely over their metadata.
 */

/** Higher wins. A provider-supplied id is direct evidence; a name match is inference. */
const METHOD_STRENGTH: Record<string, number> = {
    'tvg-id': 3,
    name: 2,
    alias: 1,
};

function methodStrength(method: string): number {
    // An unknown method (a newer or third-party Codex) ranks below every
    // method this build understands rather than above: preferring evidence
    // we cannot evaluate would let an unfamiliar Codex silently outrank a
    // local `tvg-id` match.
    return METHOD_STRENGTH[method] ?? 0;
}

/** Attribution, carried through the merge so stone 10 can prune a bad contributor's claims retroactively. */
export interface AttributedIdentityClaim extends CodexIdentityClaim {
    authorId: string;
}

/**
 * Health carries *every* contributing author, not one, because its join is
 * `max` rather than last-writer-wins: a merged claim genuinely is several
 * people's evidence at once. Keeping the set is what lets `pruneAuthors`
 * tell "only they ever claimed this" from "they were one of five".
 * Always sorted and deduplicated, so two devices serialize it identically.
 */
export interface AttributedHealthClaim extends CodexHealthClaim {
    authors: readonly string[];
}

export interface MergedKnowledge {
    identity: AttributedIdentityClaim[];
    health: AttributedHealthClaim[];
}

export const EMPTY_KNOWLEDGE: MergedKnowledge = { identity: [], health: [] };

/**
 * Author id standing for "this device saw it itself". Every real author id
 * is a 16-hex-character fingerprint (`signing.ts`), so this can never
 * collide with one, and it never leaves the device: an exported claim is
 * attributed to whoever signs the file, not to the chain of people it
 * passed through — which is all a single-signature format can honestly say.
 * Stone 10's pruning must always treat it as trusted; you do not prune
 * yourself.
 */
export const LOCAL_AUTHOR = 'local';

/**
 * Total order over competing identity claims for one key. Returns > 0 when
 * `a` wins, and 0 only for claims that are genuinely identical. Every
 * comparison is on data both sides carry, so two devices evaluating the
 * same pair always agree.
 */
export function compareIdentityClaims(a: AttributedIdentityClaim, b: AttributedIdentityClaim): number {
    if (a.observedAt !== b.observedAt) return a.observedAt - b.observedAt;
    const strength = methodStrength(a.method) - methodStrength(b.method);
    if (strength !== 0) return strength;
    // Equal strength with different names means both are methods this build
    // does not know (every known one has its own rank), so this rung only
    // ever separates unknowns — deterministically, which is all it owes.
    const method = a.method.localeCompare(b.method);
    if (method !== 0) return method;
    const author = a.authorId.localeCompare(b.authorId);
    if (author !== 0) return author;
    // Deterministic, meaningless tiebreak — but a required one. Two claims
    // that disagree about the catalog id must not compare equal, or the
    // winner would depend on which was seen first. With this rung the
    // comparator returns 0 only for genuinely identical claims.
    return a.catalogId.localeCompare(b.catalogId);
}

/** `min` over the measurements that exist — see this module's header for why the "newest wins, else fall back" rule is not associative. */
function joinTtff(a: number | null, b: number | null): number | null {
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
}

function unionAuthors(a: readonly string[], b: readonly string[]): string[] {
    return [...new Set([...a, ...b])].sort();
}

/** The join for one feed's health: grow-only in every component, so no one's evidence is ever erased. */
export function joinHealthClaims(a: AttributedHealthClaim, b: AttributedHealthClaim): AttributedHealthClaim {
    return {
        streamKey: a.streamKey,
        okWeight: Math.max(a.okWeight, b.okWeight),
        failWeight: Math.max(a.failWeight, b.failWeight),
        ttffMs: joinTtff(a.ttffMs, b.ttffMs),
        observedAt: Math.max(a.observedAt, b.observedAt),
        authors: unionAuthors(a.authors, b.authors),
    };
}

/**
 * Folds one Codex body into accumulated knowledge. Commutative,
 * associative and idempotent — see this module's header for why those three
 * properties are the entire point.
 */
export function mergeBody(into: MergedKnowledge, body: CodexBody): MergedKnowledge {
    return mergeKnowledge(into, attributeBody(body));
}

/** Tags a signed body's claims with its author, producing the shape the join operates on. */
export function attributeBody(body: CodexBody): MergedKnowledge {
    const authorId = body.author.id;
    return {
        identity: body.identity.map((claim) => ({ ...claim, authorId })),
        health: body.health.map((claim) => ({ ...claim, authors: [authorId] })),
    };
}

/** The join itself, over two already-attributed knowledge sets. */
export function mergeKnowledge(a: MergedKnowledge, b: MergedKnowledge): MergedKnowledge {
    const identity = new Map<string, AttributedIdentityClaim>();
    for (const claim of [...a.identity, ...b.identity]) {
        const key = identityClaimKey(claim);
        const existing = identity.get(key);
        if (!existing || compareIdentityClaims(claim, existing) > 0) identity.set(key, claim);
    }

    const health = new Map<string, AttributedHealthClaim>();
    for (const claim of [...a.health, ...b.health]) {
        const existing = health.get(claim.streamKey);
        health.set(claim.streamKey, existing ? joinHealthClaims(existing, claim) : normalizeHealth(claim));
    }

    // Sorted output, so two devices holding the same knowledge also
    // *serialize* it identically — which is what lets a merged Codex be
    // re-exported and compared byte for byte.
    return {
        identity: [...identity.values()].sort((x, y) => identityClaimKey(x).localeCompare(identityClaimKey(y))),
        health: [...health.values()].sort((x, y) => x.streamKey.localeCompare(y.streamKey)),
    };
}

/** A single claim passing through untouched still has to leave with a sorted, deduplicated author set, or `merge(a, a)` would not equal `merge(a, b)` shaped output. */
function normalizeHealth(claim: AttributedHealthClaim): AttributedHealthClaim {
    return { ...claim, authors: unionAuthors(claim.authors, []) };
}

/**
 * Removes what `authorIds` contributed — the retroactive pruning the vision
 * asks for ("a bad contributor can be pruned retroactively without
 * unpicking the rest").
 *
 * Identity pruning is exact: each claim has exactly one author, so dropping
 * theirs leaves the rest untouched (the next merge with any retained Codex
 * refills the key with the best remaining claim).
 *
 * Health pruning is **best-effort, and the limitation is real**: a claim
 * several people contributed to is kept, with the pruned author dropped
 * from its author set, but its `max`-joined weights cannot be unwound —
 * that would need per-author history, not just the join. A claim *only*
 * the pruned authors ever made is removed outright. The exact recovery is
 * to re-merge the retained Codexes from scratch with `mergeAll()`, which
 * works precisely because the merge is associative.
 */
export function pruneAuthors(knowledge: MergedKnowledge, authorIds: ReadonlySet<string>): MergedKnowledge {
    const health: AttributedHealthClaim[] = [];
    for (const claim of knowledge.health) {
        const authors = claim.authors.filter((author) => !authorIds.has(author));
        if (authors.length > 0) health.push({ ...claim, authors });
    }
    return {
        identity: knowledge.identity.filter((claim) => !authorIds.has(claim.authorId)),
        health,
    };
}

/** Folds many bodies in one pass. Order-independent by construction — that is what makes re-merging from scratch a clean recovery path. */
export function mergeAll(bodies: readonly CodexBody[]): MergedKnowledge {
    return bodies.reduce<MergedKnowledge>((acc, body) => mergeBody(acc, body), EMPTY_KNOWLEDGE);
}
