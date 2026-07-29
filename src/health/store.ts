import { getPlatform } from '../core/platform';
import type { StreamHealthRecord } from '../core/storage';
import { emptyRecord, healthScore, isLikelyDead, recordFailure, recordSuccess, type HealthRecord } from './score';
import { streamKey } from './stream-key';

/**
 * The health table's read/write surface, plus the synchronous in-memory
 * mirror every consumer actually reads.
 *
 * Same shape as `src/epg/match.ts`'s mapping cache and for the same reason:
 * the channel list ranks and annotates rows inside a synchronous windowed
 * republish, which cannot `await` a storage read per row. Writes go to both
 * (memory immediately, storage in the background); `primeHealthCache()`
 * restores memory from storage once at boot.
 */
let cache = new Map<string, StreamHealthRecord>();

export async function primeHealthCache(): Promise<void> {
    const rows = await getPlatform().storage.getAll('streamHealth');
    cache = new Map(rows.map((row) => [row.key, row]));
}

export function resetHealthCacheForTests(): void {
    cache = new Map();
}

/** Every known record — the Settings readout's source, and the Codex export candidate (stone 4). Typed as the *stored* record, not the bare scoring shape, because callers need the merge provenance too. */
export function allHealthRecords(): readonly StreamHealthRecord[] {
    return [...cache.values()];
}

export function healthForUrl(url: string | null | undefined): StreamHealthRecord | null {
    if (!url) return null;
    const key = streamKey(url);
    return key ? (cache.get(key) ?? null) : null;
}

export function scoreForUrl(url: string | null | undefined, nowMs: number): number | null {
    const record = healthForUrl(url);
    return record ? healthScore(record, nowMs) : null;
}

export function isUrlLikelyDead(url: string | null | undefined, nowMs: number): boolean {
    const record = healthForUrl(url);
    return record ? isLikelyDead(record, nowMs) : false;
}

/**
 * Records one playback outcome. Fire-and-forget by design — the caller is
 * the player, mid-attach or mid-failure, and a storage hiccup must never
 * turn into a playback error. The in-memory update is synchronous, so a
 * failed write costs at most this session's persistence, never correctness
 * of what the UI shows right now.
 */
export function observe(url: string | null | undefined, outcome: 'ok' | 'failed', ttffMs: number | null = null): void {
    if (!url) return;
    const key = streamKey(url);
    if (!key) return;

    const nowMs = Date.now();
    const previous = cache.get(key) ?? emptyRecord(key, nowMs);
    const apply = (record: HealthRecord): HealthRecord =>
        outcome === 'ok' ? recordSuccess(record, nowMs, ttffMs) : recordFailure(record, nowMs);

    // The merged row and this device's own evidence advance together: the
    // row is what the UI reads, the local snapshot is what a rebuild after
    // pruning starts from (`src/codex/trust.ts`).
    const nextLocal = apply(localEvidence(previous));
    const next: StreamHealthRecord = {
        ...apply(previous),
        local: { okWeight: nextLocal.okWeight, failWeight: nextLocal.failWeight, ttffMs: nextLocal.ttffMs, updatedAt: nextLocal.updatedAt },
    };
    cache.set(key, next);
    void persist(next);
}

/**
 * What this device saw for itself, separated from anything a Codex merge
 * contributed.
 *
 * Three cases, and the third is a deliberate under-count: a record written
 * before this field existed that has *already* absorbed remote claims
 * cannot be unpicked, so it yields nothing rather than crediting someone
 * else's evidence as our own. Being wrong toward "we know less than we
 * thought" is recoverable by watching something; being wrong the other way
 * would make a prune fail to remove what it promised to.
 */
export function localEvidence(record: StreamHealthRecord): HealthRecord {
    if (record.local) return { ...record, ...record.local };
    const merged = record.authors && record.authors.some((author) => author !== 'local');
    return merged ? emptyRecord(record.key, record.updatedAt) : { ...record };
}

async function persist(record: StreamHealthRecord): Promise<void> {
    try {
        await getPlatform().storage.bulkPut('streamHealth', [record], (row) => row.key);
    } catch {
        // Deliberately silent: health is an optimisation, and a device on the
        // memory tier (or one that just demoted) has nothing to write to.
    }
}

/**
 * Drops every stored record. Exposed for Settings — the same "the cache
 * survives on purpose, so there must be a manual reset" reasoning as the
 * EPG cache clear.
 */
export async function clearHealth(): Promise<void> {
    cache = new Map();
    await getPlatform().storage.clearTable('streamHealth');
}
