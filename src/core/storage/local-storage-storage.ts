import { encodeKey, type StorageKey } from './keys';
import { MemoryStorage } from './memory-storage';
import type { TableName, TableRowMap } from './records';
import type { GetRangeOptions, StorageAdapter, WriteResult } from './storage-adapter';

const PREFIX = 'tl:';
const KV_PREFIX = `${PREFIX}kv:`;
const TABLE_PREFIX = `${PREFIX}table:`;
const CHUNK_THRESHOLD_BYTES = 64 * 1024;
const BUDGET_BYTES = 5 * 1024 * 1024;

/**
 * Small, valuable data only (masterplan §5): source definitions, favorites,
 * recent, and settings survive a reload. Bulk rows (`channels`/`groups`/
 * `epgChannels`/`epgPrograms`) succeed into an in-memory overlay instead —
 * feature behavior stays identical this session, they're simply gone after
 * a reload (Feature 04.5.2).
 */
const PERSISTED_TABLES: ReadonlySet<TableName> = new Set(['playlists', 'favorites', 'recent']);

interface ChunkManifest {
    count: number;
    totalLength: number;
}

/**
 * The partial tier: chunked, quota-guarded JSON under a `tl:` prefix
 * (Feature 04.5.1). `getRange`/ranged `getAll` on a persisted table return
 * every row unfiltered rather than honoring bounds — deliberate: the only
 * table that genuinely needs time-range queries is `epgPrograms`, which is
 * never persisted here (it always goes through the in-memory overlay, where
 * ranges work exactly like the full tier).
 */
export class LocalStorageStorage implements StorageAdapter {
    readonly tier = 'partial' as const;

    private readonly overlay = new MemoryStorage();

    get<T = unknown>(key: string): Promise<T | undefined> {
        const raw = this.readLogical(KV_PREFIX + key);
        return Promise.resolve(raw === undefined ? undefined : (JSON.parse(raw) as T));
    }

    set<T = unknown>(key: string, value: T): Promise<WriteResult> {
        return Promise.resolve(this.writeLogical(KV_PREFIX + key, value));
    }

    getMany<T = unknown>(keys: string[]): Promise<(T | undefined)[]> {
        return Promise.resolve(
            keys.map((key) => {
                const raw = this.readLogical(KV_PREFIX + key);
                return raw === undefined ? undefined : (JSON.parse(raw) as T);
            }),
        );
    }

    setMany<T = unknown>(entries: [key: string, value: T][]): Promise<WriteResult> {
        for (const [key, value] of entries) {
            const result = this.writeLogical(KV_PREFIX + key, value);
            if (!result.ok) return Promise.resolve(result);
        }
        return Promise.resolve({ ok: true });
    }

    delete(key: string): Promise<void> {
        this.removeLogical(KV_PREFIX + key);
        return Promise.resolve();
    }

    bulkPut<T extends TableName>(
        table: T,
        rows: TableRowMap[T][],
        keyOf: (row: TableRowMap[T]) => StorageKey,
    ): Promise<WriteResult> {
        if (!PERSISTED_TABLES.has(table)) {
            return this.overlay.bulkPut(table, rows, keyOf);
        }
        const merged = new Map(this.readTableRows(table).map((row) => [encodeKey(keyOf(row)), row]));
        for (const row of rows) merged.set(encodeKey(keyOf(row)), row);
        return Promise.resolve(this.writeLogical(TABLE_PREFIX + table, [...merged.values()]));
    }

    getAll<T extends TableName>(table: T, range?: GetRangeOptions): Promise<TableRowMap[T][]> {
        if (!PERSISTED_TABLES.has(table)) return this.overlay.getAll(table, range);
        return Promise.resolve(this.readTableRows(table));
    }

    getRange<T extends TableName>(table: T, lower: StorageKey, upper: StorageKey): Promise<TableRowMap[T][]> {
        if (!PERSISTED_TABLES.has(table)) return this.overlay.getRange(table, lower, upper);
        return Promise.resolve(this.readTableRows(table));
    }

    clearTable(table: TableName): Promise<void> {
        if (!PERSISTED_TABLES.has(table)) return this.overlay.clearTable(table);
        this.removeLogical(TABLE_PREFIX + table);
        return Promise.resolve();
    }

    count(table: TableName): Promise<number> {
        if (!PERSISTED_TABLES.has(table)) return this.overlay.count(table);
        return Promise.resolve(this.readTableRows(table).length);
    }

    deleteRow<T extends TableName>(table: T, key: StorageKey): Promise<void> {
        if (!PERSISTED_TABLES.has(table)) return this.overlay.deleteRow(table, key);
        const encoded = encodeKey(key);
        const remaining = this.readTableRows(table).filter((row) => encodeKey((row as { id: string }).id) !== encoded);
        this.writeLogical(TABLE_PREFIX + table, remaining);
        return Promise.resolve();
    }

    deleteByPlaylistId(table: 'channels' | 'groups', playlistId: string): Promise<void> {
        // `channels`/`groups` are never in PERSISTED_TABLES (Feature
        // 04.5.2) — always the in-memory overlay on this tier.
        return this.overlay.deleteByPlaylistId(table, playlistId);
    }

    /** Sorted by `id` (Feature 04.10's cross-tier consistency): every persisted table's row type keys on a single string `id`, so this matches the key order `MemoryStorage`/`IdbStorage` naturally produce — `getAll` never depends on which tier answered it. */
    private readTableRows<T extends TableName>(table: T): TableRowMap[T][] {
        const raw = this.readLogical(TABLE_PREFIX + table);
        if (raw === undefined) return [];
        try {
            const rows = JSON.parse(raw) as (TableRowMap[T] & { id: string })[];
            return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        } catch {
            return [];
        }
    }

    /** Budget check first (Feature 04.5.6), then a direct write or chunked write-chunks-first/manifest-last (Feature 04.5.4/04.5.5). */
    private writeLogical(logicalKey: string, value: unknown): WriteResult {
        const serialized = JSON.stringify(value);
        const projected = this.totalBytes() - this.sizeOfLogical(logicalKey) + logicalKey.length + serialized.length;
        if (projected > BUDGET_BYTES) {
            return { ok: false, reason: 'budget' };
        }

        this.removeLogical(logicalKey);
        if (serialized.length <= CHUNK_THRESHOLD_BYTES) {
            return guardedSet(logicalKey, serialized);
        }

        const chunkCount = Math.ceil(serialized.length / CHUNK_THRESHOLD_BYTES);
        for (let i = 0; i < chunkCount; i++) {
            const chunk = serialized.slice(i * CHUNK_THRESHOLD_BYTES, (i + 1) * CHUNK_THRESHOLD_BYTES);
            const result = guardedSet(chunkKey(logicalKey, i), chunk);
            if (!result.ok) {
                this.removeLogical(logicalKey);
                return result;
            }
        }
        const manifest: ChunkManifest = { count: chunkCount, totalLength: serialized.length };
        return guardedSet(manifestKey(logicalKey), JSON.stringify(manifest));
    }

    private readLogical(logicalKey: string): string | undefined {
        const direct = localStorage.getItem(logicalKey);
        if (direct !== null) return direct;

        const manifestRaw = localStorage.getItem(manifestKey(logicalKey));
        if (manifestRaw === null) return undefined;
        const manifest = parseManifest(manifestRaw);
        if (!manifest) return undefined;

        let combined = '';
        for (let i = 0; i < manifest.count; i++) {
            const chunk = localStorage.getItem(chunkKey(logicalKey, i));
            // A missing chunk means a truncated/interrupted write — discard
            // rather than return a corrupt partial parse (Feature 04.5.5).
            if (chunk === null) return undefined;
            combined += chunk;
        }
        return combined.length === manifest.totalLength ? combined : undefined;
    }

    private removeLogical(logicalKey: string): void {
        localStorage.removeItem(logicalKey);
        const manifestRaw = localStorage.getItem(manifestKey(logicalKey));
        if (manifestRaw === null) return;
        const manifest = parseManifest(manifestRaw);
        if (manifest) {
            for (let i = 0; i < manifest.count; i++) localStorage.removeItem(chunkKey(logicalKey, i));
        }
        localStorage.removeItem(manifestKey(logicalKey));
    }

    private sizeOfLogical(logicalKey: string): number {
        let total = 0;
        const direct = localStorage.getItem(logicalKey);
        if (direct !== null) total += logicalKey.length + direct.length;

        const mKey = manifestKey(logicalKey);
        const manifestRaw = localStorage.getItem(mKey);
        if (manifestRaw === null) return total;
        total += mKey.length + manifestRaw.length;
        const manifest = parseManifest(manifestRaw);
        if (manifest) {
            for (let i = 0; i < manifest.count; i++) {
                const key = chunkKey(logicalKey, i);
                const chunk = localStorage.getItem(key);
                if (chunk !== null) total += key.length + chunk.length;
            }
        }
        return total;
    }

    private totalBytes(): number {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(PREFIX)) total += key.length + (localStorage.getItem(key)?.length ?? 0);
        }
        return total;
    }
}

function manifestKey(logicalKey: string): string {
    return `${logicalKey}#manifest`;
}

function chunkKey(logicalKey: string, index: number): string {
    return `${logicalKey}#${String(index)}`;
}

function parseManifest(raw: string): ChunkManifest | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'count' in parsed &&
            'totalLength' in parsed &&
            typeof parsed.count === 'number' &&
            typeof parsed.totalLength === 'number'
        ) {
            return parsed as ChunkManifest;
        }
        return null;
    } catch {
        return null;
    }
}

/** Ported from MASTERPLAN.md §5.7 — a `QuotaExceededError` (or any other write failure) resolves classified, never white-screens (Feature 04.5.3). Duck-types `.name` per the Phase 03/04.4.7 realm-mismatch finding. */
function guardedSet(key: string, value: string): WriteResult {
    try {
        localStorage.setItem(key, value);
        return { ok: true };
    } catch (e) {
        const name = typeof e === 'object' && e !== null && 'name' in e ? e.name : undefined;
        return { ok: false, reason: name === 'QuotaExceededError' ? 'quota' : 'io' };
    }
}
