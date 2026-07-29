import { getPlatform } from '../core/platform';
import type { StreamHealthRecord } from '../core/storage';
import { mappingKey, primeMappingCache, type StoredMapping } from '../epg/match';
import { localEvidence } from '../health/store';
import { LOCAL_AUTHOR, type AttributedHealthClaim, type AttributedIdentityClaim, type MergedKnowledge } from './merge';

/**
 * The boundary between `merge.ts`'s pure lattice and the storage the rest of
 * the app actually reads.
 *
 * Everything here is deliberately dumb: read local state into claim shape,
 * write merged claims back out. No ordering decisions live in this file —
 * they are all in `merge.ts`, which is what makes them testable without a
 * platform. Both the single-document import (`apply.ts`) and the
 * rebuild-from-library (`library.ts`) go through this same pair, so the two
 * paths cannot drift into disagreeing about what a merge means.
 *
 * `'own-only'` is the mode that makes pruning exact. It reads what this
 * device saw for itself, with every contributed claim excluded, so a
 * rebuild can start from a clean base and re-apply exactly the Codexes the
 * user still trusts.
 */

export type ReadMode = 'merged' | 'own-only';

export interface CommitCounts {
    identityApplied: number;
    healthApplied: number;
}

function recordToClaim(row: StreamHealthRecord, mode: ReadMode): AttributedHealthClaim {
    const source = mode === 'own-only' ? { ...row, ...localEvidence(row) } : row;
    return {
        streamKey: row.key,
        okWeight: source.okWeight,
        failWeight: source.failWeight,
        ttffMs: source.ttffMs,
        observedAt: source.updatedAt,
        authors: mode === 'own-only' ? [LOCAL_AUTHOR] : (row.authors ?? [LOCAL_AUTHOR]),
    };
}

function matchToClaim(country: string, match: StoredMapping['matches'][number], savedAt: number): AttributedIdentityClaim {
    return {
        country,
        channelKey: match.channelKey,
        catalogId: match.catalogId,
        method: match.method,
        // A locally derived entry has no per-claim timestamp — the snapshot
        // was written wholesale — so `savedAt` stands in.
        observedAt: match.observedAt ?? savedAt,
        authorId: match.authorId ?? LOCAL_AUTHOR,
    };
}

export async function localKnowledge(countries: readonly string[], mode: ReadMode): Promise<MergedKnowledge> {
    const storage = getPlatform().storage;
    const rows = await storage.getAll('streamHealth');

    const identity: AttributedIdentityClaim[] = [];
    for (const country of countries) {
        const stored = await storage.get<StoredMapping>(mappingKey(country));
        if (!stored) continue;
        for (const match of stored.matches) {
            const claim = matchToClaim(country, match, stored.savedAt);
            if (mode === 'own-only' && claim.authorId !== LOCAL_AUTHOR) continue;
            identity.push(claim);
        }
    }

    return { identity, health: rows.map((row) => recordToClaim(row, mode)) };
}

/** True when the join actually moved this record — a merge that changes nothing must not be reported as if it did. */
function differs(row: StreamHealthRecord, claim: AttributedHealthClaim): boolean {
    return (
        row.okWeight !== claim.okWeight ||
        row.failWeight !== claim.failWeight ||
        row.updatedAt !== claim.observedAt ||
        row.ttffMs !== claim.ttffMs ||
        (row.authors ?? [LOCAL_AUTHOR]).join(',') !== claim.authors.join(',')
    );
}

/**
 * Writes merged knowledge back into the shapes the app reads. Every country
 * in `countries` is rewritten even when the merge produced no claims for
 * it — that is what lets a rebuild *shrink* a mapping whose entries all came
 * from an author the user has since blocked.
 */
export async function commitKnowledge(
    knowledge: MergedKnowledge,
    countries: readonly string[],
    savedAt: number,
): Promise<CommitCounts> {
    return {
        healthApplied: await commitHealth(knowledge.health),
        identityApplied: await commitIdentity(knowledge.identity, countries, savedAt),
    };
}

async function commitHealth(claims: readonly AttributedHealthClaim[]): Promise<number> {
    const storage = getPlatform().storage;
    const existing = new Map((await storage.getAll('streamHealth')).map((row) => [row.key, row]));

    const changed: StreamHealthRecord[] = [];
    for (const claim of claims) {
        const mine = existing.get(claim.streamKey);
        if (mine && !differs(mine, claim)) continue;
        changed.push({
            key: claim.streamKey,
            okWeight: claim.okWeight,
            failWeight: claim.failWeight,
            updatedAt: claim.observedAt,
            ttffMs: claim.ttffMs,
            // `lastOutcome`/`lastAt` are this device's own playback log, not
            // shared evidence, so a merge never overwrites them — only a key
            // we have never seen needs one synthesised from the weights.
            lastOutcome: mine?.lastOutcome ?? (claim.okWeight >= claim.failWeight ? 'ok' : 'failed'),
            lastAt: Math.max(mine?.lastAt ?? 0, claim.observedAt),
            authors: claim.authors,
            // Carried through untouched: what we saw ourselves is not
            // something a merge — or a rebuild after one — may rewrite.
            ...(mine?.local ? { local: mine.local } : {}),
        });
    }

    if (changed.length > 0) await storage.bulkPut('streamHealth', changed, (row) => row.key);
    return changed.length;
}

async function commitIdentity(
    claims: readonly AttributedIdentityClaim[],
    countries: readonly string[],
    savedAt: number,
): Promise<number> {
    const storage = getPlatform().storage;
    const byCountry = new Map<string, AttributedIdentityClaim[]>(countries.map((country) => [country, []]));
    for (const claim of claims) byCountry.get(claim.country)?.push(claim);

    let applied = 0;
    for (const [country, countryClaims] of byCountry) {
        const key = mappingKey(country);
        const previous = await storage.get<StoredMapping>(key);
        const before = new Map((previous?.matches ?? []).map((match) => [match.channelKey, match]));

        for (const claim of countryClaims) {
            const was = before.get(claim.channelKey);
            if (!was || was.catalogId !== claim.catalogId || was.method !== claim.method) applied += 1;
        }
        applied += [...before.keys()].filter((channelKey) => !countryClaims.some((c) => c.channelKey === channelKey)).length;

        await storage.set(key, {
            savedAt: Math.max(previous?.savedAt ?? 0, savedAt),
            matches: countryClaims.map((claim) => ({
                channelKey: claim.channelKey,
                catalogId: claim.catalogId,
                method: claim.method,
                observedAt: claim.observedAt,
                authorId: claim.authorId,
            })),
        } satisfies StoredMapping);

        // The channel list reads the mapping through `getMappingSync()`, a
        // module-memory mirror that a storage write alone does not update.
        // Without this the caller's own `refreshLiveRows()` would rebuild
        // from the pre-merge mapping and the claims would appear to do
        // nothing until the next boot.
        await primeMappingCache(country);
    }
    return applied;
}
