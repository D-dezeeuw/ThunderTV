import type { StorageAdapter, WriteResult } from './storage-adapter';

/**
 * Every long-lived stored shape (`settings`, `playlists`, `favorites`,
 * `recent`) is wrapped `{ v, data }` at the adapter boundary (Feature
 * 04.9.1). `channels`/`epgPrograms` rows are unversioned by design — they
 * are re-parseable caches, not long-lived user data (Feature 04.9.2).
 *
 * `idb`'s native `version`/`upgrade` (see `idb-schema.ts`) handles
 * *structural* changes (new stores/indexes); this envelope handles *shape*
 * changes within a store's values (Feature 04.9.5) — both live under
 * `src/core/storage/`.
 */
export interface VersionedEnvelope<T = unknown> {
    v: number;
    data: T;
}

export type MigrationFn = (old: unknown) => unknown;

interface MigrationEntry {
    fromV: number;
    toV: number;
    fn: MigrationFn;
}

const registry = new Map<string, MigrationEntry[]>();

/** Migration functions are pure `(old) => new` — no storage/platform access (Feature 04.9.7), enforced by this signature. */
export function registerMigration(keyFamily: string, fromV: number, toV: number, fn: MigrationFn): void {
    const chain = registry.get(keyFamily) ?? [];
    chain.push({ fromV, toV, fn });
    registry.set(keyFamily, chain);
}

/** Eagerly walks a registered chain — call once, at module load, right after registering every hook for `keyFamily` (Feature 04.9.8: a missing link is a registry-time error, not a read-time surprise). */
export function assertMigrationChainComplete(keyFamily: string, fromV: number, toV: number): void {
    const chain = registry.get(keyFamily) ?? [];
    let v = fromV;
    while (v < toV) {
        const step = chain.find((m) => m.fromV === v);
        if (!step) {
            throw new Error(
                `versioning: no migration registered for "${keyFamily}" from v${String(v)} (need a path to v${String(toV)})`,
            );
        }
        v = step.toV;
    }
}

/**
 * Reads a versioned value, migrating and writing back if it was stored at
 * an older version (Feature 04.9.3) — write-back happens at most once per
 * read, even across a multi-step chain. A version newer than `currentV`
 * (a downgraded app) or a corrupt envelope resolves `undefined`, never
 * throws (Feature 04.9.4).
 */
export async function getVersioned<T>(
    storage: StorageAdapter,
    keyFamily: string,
    key: string,
    currentV: number,
): Promise<T | undefined> {
    const raw = await storage.get<VersionedEnvelope>(key);
    if (!isVersionedEnvelope(raw)) return undefined;

    if (raw.v === currentV) return raw.data as T;
    if (raw.v > currentV) {
        logDiagnostic(keyFamily, `stored version v${String(raw.v)} is newer than this build's v${String(currentV)}`);
        return undefined;
    }

    const migrated = runChain(keyFamily, raw.v, raw.data, currentV);
    if (migrated === undefined) return undefined;
    await storage.set(key, wrapVersioned(currentV, migrated));
    return migrated as T;
}

export function setVersioned<T>(storage: StorageAdapter, key: string, currentV: number, data: T): Promise<WriteResult> {
    return storage.set(key, wrapVersioned(currentV, data));
}

function wrapVersioned<T>(v: number, data: T): VersionedEnvelope<T> {
    return { v, data };
}

function runChain(keyFamily: string, fromV: number, data: unknown, toV: number): unknown {
    const chain = registry.get(keyFamily) ?? [];
    let v = fromV;
    let value = data;
    while (v < toV) {
        const step = chain.find((m) => m.fromV === v);
        if (!step) {
            logDiagnostic(keyFamily, `no migration registered from v${String(v)}`);
            return undefined;
        }
        value = step.fn(value);
        v = step.toV;
    }
    return value;
}

function isVersionedEnvelope(value: unknown): value is VersionedEnvelope {
    return typeof value === 'object' && value !== null && 'v' in value && 'data' in value && typeof value.v === 'number';
}

/** No stored data in the message — only the key family and version numbers (Feature 04.9.4). */
function logDiagnostic(keyFamily: string, message: string): void {
    console.warn(`[ThunderTV] versioning(${keyFamily}): ${message}`);
}
