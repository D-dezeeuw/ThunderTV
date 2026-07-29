import { getPlatform } from '../core/platform';
import type { StreamHealthRecord } from '../core/storage';
import { primeHealthCache } from '../health/store';
import { isCodexDocument, type CodexDocument, type CodexHealthClaim } from './format';
import { verifyDocument } from './signing';

/**
 * Taking someone else's Codex in.
 *
 * v0's merge rule is **newest observation wins, per claim key** — not a
 * CRDT. That is a deliberate, stated limitation: real convergence (merge
 * by evidence weight with provenance per claim, so two devices that have
 * both learned things end up agreeing regardless of import order) is
 * stone 6, Phase 36. What v0 does guarantee is that the shape it reads and
 * writes is the shape that merge will need, so adopting it later is not a
 * format break.
 *
 * Health claims merge by *taking the maximum* of each side's decayed
 * weights rather than replacing: two people's independent evidence about
 * the same feed genuinely is more evidence, and replacing would throw away
 * whichever half arrived first.
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

    const healthApplied = await applyHealth(document.body.health);
    const identityApplied = await applyIdentity(document);
    await primeHealthCache();

    return { ok: true, authorId: document.body.author.id, identityApplied, healthApplied };
}

async function applyHealth(claims: readonly CodexHealthClaim[]): Promise<number> {
    if (claims.length === 0) return 0;
    const storage = getPlatform().storage;
    const existing = new Map((await storage.getAll('streamHealth')).map((row) => [row.key, row]));

    const merged: StreamHealthRecord[] = claims.map((claim) => {
        const mine = existing.get(claim.streamKey);
        if (!mine) {
            return {
                key: claim.streamKey,
                okWeight: claim.okWeight,
                failWeight: claim.failWeight,
                updatedAt: claim.observedAt,
                ttffMs: claim.ttffMs,
                lastOutcome: claim.okWeight >= claim.failWeight ? 'ok' : 'failed',
                lastAt: claim.observedAt,
            };
        }
        // Both sides' weights are already decayed to their own `updatedAt`.
        // Taking the max of each, and the later timestamp, keeps the result
        // conservative: no one's evidence is erased by someone else's, and
        // the record cannot be aged backwards into looking fresher than it is.
        const newer = Math.max(mine.updatedAt, claim.observedAt);
        return {
            ...mine,
            okWeight: Math.max(mine.okWeight, claim.okWeight),
            failWeight: Math.max(mine.failWeight, claim.failWeight),
            updatedAt: newer,
            ttffMs: mine.ttffMs ?? claim.ttffMs,
            lastAt: Math.max(mine.lastAt, claim.observedAt),
        };
    });

    await storage.bulkPut('streamHealth', merged, (row) => row.key);
    return merged.length;
}

interface StoredMapping {
    savedAt: number;
    matches: { channelKey: string; catalogId: string; method: string }[];
}

async function applyIdentity(document: CodexDocument): Promise<number> {
    const storage = getPlatform().storage;
    const byCountry = new Map<string, CodexDocument['body']['identity']>();
    for (const claim of document.body.identity) {
        const bucket = byCountry.get(claim.country);
        if (bucket) bucket.push(claim);
        else byCountry.set(claim.country, [claim]);
    }

    let applied = 0;
    for (const [country, claims] of byCountry) {
        const key = `epg.mapping.${country}`;
        const mine = await storage.get<StoredMapping>(key);
        const merged = new Map((mine?.matches ?? []).map((match) => [match.channelKey, match]));

        for (const claim of claims) {
            // Newest wins. A local mapping that is already newer than the
            // imported claim is left alone — importing a Codex must never
            // undo something this device has since re-derived.
            if (mine && mine.savedAt > claim.observedAt && merged.has(claim.channelKey)) continue;
            merged.set(claim.channelKey, {
                channelKey: claim.channelKey,
                catalogId: claim.catalogId,
                method: claim.method,
            });
            applied += 1;
        }

        await storage.set(key, {
            savedAt: Math.max(mine?.savedAt ?? 0, document.body.generatedAt),
            matches: [...merged.values()],
        });
    }
    return applied;
}
