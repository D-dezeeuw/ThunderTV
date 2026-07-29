import { getPlatform } from '../core/platform';
import type { StreamHealthRecord } from '../core/storage';
import { mappingKey, primeMappingCache, type StoredMapping } from '../epg/match';
import { primeHealthCache } from '../health/store';
import { isCodexDocument, type CodexDocument } from './format';
import {
    LOCAL_AUTHOR,
    attributeBody,
    mergeKnowledge,
    type AttributedHealthClaim,
    type AttributedIdentityClaim,
} from './merge';
import { verifyDocument } from './signing';

/**
 * Taking someone else's Codex in.
 *
 * Since Phase 36 (stone 6) the merge rule is `src/codex/merge.ts`'s CRDT
 * join, not v0's newest-wins: import order no longer changes the result, so
 * two people who trade Codexes converge on the same state. This file is
 * only the *plumbing* around that — read local state, join, write back. All
 * the ordering decisions live in `merge.ts`, and its three laws are what
 * make this safe to run repeatedly.
 *
 * The projection back into storage matters as much as the join. Local
 * knowledge lives in the shapes the rest of the app already reads
 * (`streamHealth` rows and `epg.mapping.<country>` snapshots), so those stay
 * the source of truth and gain two optional provenance fields rather than
 * being replaced by a parallel store. Nothing downstream has to change, and
 * the next merge can still tell whose evidence is whose.
 */

export type CodexImportProblem = 'not-json' | 'not-a-codex' | 'bad-signature';

export interface CodexImportResult {
    ok: boolean;
    problem?: CodexImportProblem;
    /** Fingerprint of whoever signed it — shown so a user can recognise a Codex they have taken before. */
    authorId?: string;
    identityApplied: number;
    healthApplied: number;
}

const FAILED: Omit<CodexImportResult, 'problem'> = { ok: false, identityApplied: 0, healthApplied: 0 };

/**
 * Parses, verifies and applies a Codex file.
 *
 * A file that fails verification is rejected outright rather than applied
 * with a warning: an unsigned or tampered Codex has no author to hold
 * responsible, which is precisely what stone 10's pruning model depends on
 * existing.
 */
export async function importCodex(text: string): Promise<CodexImportResult> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ...FAILED, problem: 'not-json' };
    }
    if (!isCodexDocument(parsed)) return { ...FAILED, problem: 'not-a-codex' };

    const document: CodexDocument = parsed;
    if (!(await verifyDocument(document))) {
        return { ...FAILED, problem: 'bad-signature', authorId: document.body.author.id };
    }

    const incoming = attributeBody(document.body);
    const healthApplied = await applyHealth(incoming.health);
    const identityApplied = await applyIdentity(incoming.identity, document.body.generatedAt);
    await primeHealthCache();

    return { ok: true, authorId: document.body.author.id, identityApplied, healthApplied };
}

function recordToClaim(row: StreamHealthRecord): AttributedHealthClaim {
    return {
        streamKey: row.key,
        okWeight: row.okWeight,
        failWeight: row.failWeight,
        ttffMs: row.ttffMs,
        observedAt: row.updatedAt,
        authors: row.authors ?? [LOCAL_AUTHOR],
    };
}

/** True when the join actually moved this record — an import that changes nothing must not be reported as if it did. */
function differs(row: StreamHealthRecord, claim: AttributedHealthClaim): boolean {
    return (
        row.okWeight !== claim.okWeight ||
        row.failWeight !== claim.failWeight ||
        row.updatedAt !== claim.observedAt ||
        row.ttffMs !== claim.ttffMs ||
        (row.authors ?? [LOCAL_AUTHOR]).join(',') !== claim.authors.join(',')
    );
}

async function applyHealth(incoming: readonly AttributedHealthClaim[]): Promise<number> {
    if (incoming.length === 0) return 0;
    const storage = getPlatform().storage;
    const rows = await storage.getAll('streamHealth');
    const existing = new Map(rows.map((row) => [row.key, row]));

    const merged = mergeKnowledge({ identity: [], health: rows.map(recordToClaim) }, { identity: [], health: [...incoming] });

    const changed: StreamHealthRecord[] = [];
    for (const claim of merged.health) {
        const mine = existing.get(claim.streamKey);
        if (mine && !differs(mine, claim)) continue;
        changed.push({
            key: claim.streamKey,
            okWeight: claim.okWeight,
            failWeight: claim.failWeight,
            updatedAt: claim.observedAt,
            ttffMs: claim.ttffMs,
            // `lastOutcome` and `lastAt` are this device's own playback log,
            // not shared evidence, so a merge never overwrites them — only a
            // key we have never seen needs one synthesised from the weights.
            lastOutcome: mine?.lastOutcome ?? (claim.okWeight >= claim.failWeight ? 'ok' : 'failed'),
            lastAt: Math.max(mine?.lastAt ?? 0, claim.observedAt),
            authors: claim.authors,
        });
    }

    if (changed.length > 0) await storage.bulkPut('streamHealth', changed, (row) => row.key);
    return changed.length;
}

async function applyIdentity(incoming: readonly AttributedIdentityClaim[], generatedAt: number): Promise<number> {
    const byCountry = new Map<string, AttributedIdentityClaim[]>();
    for (const claim of incoming) {
        const bucket = byCountry.get(claim.country);
        if (bucket) bucket.push(claim);
        else byCountry.set(claim.country, [claim]);
    }

    let applied = 0;
    for (const [country, claims] of byCountry) applied += await applyCountry(country, claims, generatedAt);
    return applied;
}

async function applyCountry(country: string, claims: readonly AttributedIdentityClaim[], generatedAt: number): Promise<number> {
    const storage = getPlatform().storage;
    const key = mappingKey(country);
    const mine = await storage.get<StoredMapping>(key);

    // A locally derived entry has no per-claim timestamp — the snapshot was
    // written wholesale — so `savedAt` stands in. That is what preserves v0's
    // guarantee that importing never undoes something this device has since
    // re-derived: a fresher local snapshot simply outranks the claim.
    const local: AttributedIdentityClaim[] = (mine?.matches ?? []).map((match) => ({
        country,
        channelKey: match.channelKey,
        catalogId: match.catalogId,
        method: match.method,
        observedAt: match.observedAt ?? mine?.savedAt ?? 0,
        authorId: match.authorId ?? LOCAL_AUTHOR,
    }));

    const merged = mergeKnowledge({ identity: local, health: [] }, { identity: [...claims], health: [] });

    const before = new Map(local.map((claim) => [claim.channelKey, claim]));
    let applied = 0;
    for (const claim of merged.identity) {
        const previous = before.get(claim.channelKey);
        if (!previous || previous.catalogId !== claim.catalogId || previous.method !== claim.method) applied += 1;
    }

    await storage.set(key, {
        savedAt: Math.max(mine?.savedAt ?? 0, generatedAt),
        matches: merged.identity.map((claim) => ({
            channelKey: claim.channelKey,
            catalogId: claim.catalogId,
            method: claim.method,
            observedAt: claim.observedAt,
            authorId: claim.authorId,
        })),
    } satisfies StoredMapping);

    // The channel list reads the mapping through `getMappingSync()`, a
    // module-memory mirror that only storage writes do not update. Without
    // this the import's own `refreshLiveRows()` would rebuild from the
    // pre-merge mapping and the claims would appear to do nothing until the
    // next boot.
    await primeMappingCache(country);

    return applied;
}
