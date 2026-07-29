import { getPlatform } from '../core/platform';
import { mappingKey, type StoredMapping } from '../epg/match';
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
        const stored = await storage.get<StoredMapping>(mappingKey(country));
        if (!stored) continue;
        for (const match of stored.matches) {
            claims.push({
                country,
                channelKey: match.channelKey,
                catalogId: match.catalogId,
                method: match.method,
                // An entry a Codex merge folded in carries the timestamp it
                // was actually observed at; one this device derived does not,
                // because the mapping is snapshotted wholesale rather than per
                // entry, so the snapshot's own time stands in. Honest about
                // the precision actually available, and enough for ordering.
                observedAt: match.observedAt ?? stored.savedAt,
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
