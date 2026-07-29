import { getPlatform } from '../core/platform';
import { allHealthRecords } from '../health/store';
import { CODEX_FORMAT_VERSION, sortClaims, type CodexBody, type CodexDocument, type CodexHealthClaim, type CodexIdentityClaim } from './format';
import { loadOrCreateIdentity, signBody } from './signing';

/**
 * Collecting this device's knowledge into a Codex.
 *
 * Two claim kinds, chosen because both are credential-free *by
 * construction* rather than by a redaction pass: the EPG identity mapping
 * (keys and catalog ids, no URLs at all) and stream health (already keyed
 * on `src/health/stream-key.ts`'s masked fingerprint). Favorites, sources
 * and recents are deliberately excluded — they carry raw stream URLs with
 * the account's credentials in the path, and a file the user is encouraged
 * to hand around must never be able to leak those.
 */

const GENERATOR = 'ThunderTV';

/** Mapping snapshots are stored per country under `epg.mapping.<country>` (`src/epg/match.ts`). */
interface StoredMapping {
    savedAt: number;
    matches: { channelKey: string; catalogId: string; method: string }[];
}

const MAPPING_PREFIX = 'epg.mapping.';

export async function buildCodex(countries: readonly string[]): Promise<CodexDocument> {
    const identity = await loadOrCreateIdentity();
    const body: CodexBody = sortClaims({
        format: CODEX_FORMAT_VERSION,
        generatedAt: Date.now(),
        generator: GENERATOR,
        author: identity.author,
        identity: await collectIdentityClaims(countries),
        health: collectHealthClaims(),
    });
    return { body, signature: await signBody(body, identity.privateKey) };
}

async function collectIdentityClaims(countries: readonly string[]): Promise<CodexIdentityClaim[]> {
    const storage = getPlatform().storage;
    const claims: CodexIdentityClaim[] = [];
    for (const country of countries) {
        const stored = await storage.get<StoredMapping>(`${MAPPING_PREFIX}${country}`);
        if (!stored) continue;
        for (const match of stored.matches) {
            claims.push({
                country,
                channelKey: match.channelKey,
                catalogId: match.catalogId,
                method: match.method,
                // The mapping is snapshotted wholesale rather than per entry,
                // so every claim from one snapshot shares its timestamp. Good
                // enough for merge ordering, and honest about the precision
                // actually available.
                observedAt: stored.savedAt,
            });
        }
    }
    return claims;
}

function collectHealthClaims(): CodexHealthClaim[] {
    return allHealthRecords().map((record) => ({
        streamKey: record.key,
        okWeight: record.okWeight,
        failWeight: record.failWeight,
        ttffMs: record.ttffMs,
        observedAt: record.updatedAt,
    }));
}
