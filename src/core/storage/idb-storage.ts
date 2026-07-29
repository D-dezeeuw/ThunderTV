import { openDB, type IDBPDatabase } from 'idb';
import type { StorageKey } from './keys';
import { BULK_STORE_NAMES, DB_NAME, DB_VERSION, SETTINGS_STORE, type ThunderTvDb } from './idb-schema';
import type { TableName, TableRowMap } from './records';
import type { GetRangeOptions, StorageAdapter, WriteResult } from './storage-adapter';

/**
 * The full tier: the plan's eight object stores (seven bulk tables plus
 * `settings`) via the `idb` wrapper. Out-of-line keys throughout — see
 * `idb-schema.ts` for why no store needs an inline `keyPath` or a secondary
 * index (Feature 04.4.5).
 */
export class IdbStorage implements StorageAdapter {
    readonly tier = 'full' as const;

    private dbPromise: Promise<IDBPDatabase<ThunderTvDb>> | null = null;

    private db(): Promise<IDBPDatabase<ThunderTvDb>> {
        this.dbPromise ??= this.open();
        return this.dbPromise;
    }

    private open(): Promise<IDBPDatabase<ThunderTvDb>> {
        return openDB<ThunderTvDb>(DB_NAME, DB_VERSION, {
            // Guarded so a version bump (e.g. v1 → v2 adding `epgCatalog`,
            // Phase 31) never re-creates a store that already exists —
            // `createObjectStore` throws on a duplicate name, and `upgrade`
            // runs against the *whole* jump from the stored version to
            // `DB_VERSION`, not just the newly added stores.
            upgrade(db) {
                for (const name of BULK_STORE_NAMES) {
                    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
                }
                if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
            },
            blocked: () => logDiagnostic('open blocked by another tab holding an old version'),
            blocking: () => logDiagnostic('blocking another tab\'s upgrade; this connection should close'),
            terminated: () => {
                // Feature 04.4.8: close and reopen — the next call to db()
                // opens a fresh connection instead of reusing a dead one.
                logDiagnostic('connection terminated unexpectedly; will reopen on next use');
                this.dbPromise = null;
            },
        });
    }

    async get<T = unknown>(key: string): Promise<T | undefined> {
        const db = await this.db();
        return (await db.get(SETTINGS_STORE, key)) as T | undefined;
    }

    set<T = unknown>(key: string, value: T): Promise<WriteResult> {
        return this.write(async (db) => {
            await db.put(SETTINGS_STORE, value, key);
        });
    }

    async getMany<T = unknown>(keys: string[]): Promise<(T | undefined)[]> {
        const db = await this.db();
        const tx = db.transaction(SETTINGS_STORE, 'readonly');
        const values = await Promise.all(keys.map((key) => tx.store.get(key)));
        await tx.done;
        return values as (T | undefined)[];
    }

    setMany<T = unknown>(entries: [key: string, value: T][]): Promise<WriteResult> {
        return this.write(async (db) => {
            const tx = db.transaction(SETTINGS_STORE, 'readwrite');
            for (const [key, value] of entries) void tx.store.put(value, key);
            await tx.done;
        });
    }

    async delete(key: string): Promise<void> {
        const db = await this.db();
        await db.delete(SETTINGS_STORE, key);
    }

    bulkPut<T extends TableName>(
        table: T,
        rows: TableRowMap[T][],
        keyOf: (row: TableRowMap[T]) => StorageKey,
    ): Promise<WriteResult> {
        return this.write(async (db) => {
            // One transaction per chunk (Feature 04.4.6), never one per row.
            const tx = db.transaction(table, 'readwrite');
            for (const row of rows) void tx.store.put(row, keyOf(row) as never);
            await tx.done;
        });
    }

    async getAll<T extends TableName>(table: T, range?: GetRangeOptions): Promise<TableRowMap[T][]> {
        const db = await this.db();
        const idbRange = toIdbRange(range);
        return (await db.getAll(table, idbRange)) as TableRowMap[T][];
    }

    async getRange<T extends TableName>(table: T, lower: StorageKey, upper: StorageKey): Promise<TableRowMap[T][]> {
        const db = await this.db();
        const range = IDBKeyRange.bound(lower, upper);
        return (await db.getAll(table, range)) as TableRowMap[T][];
    }

    async clearTable(table: TableName): Promise<void> {
        const db = await this.db();
        await db.clear(table);
    }

    async count(table: TableName): Promise<number> {
        const db = await this.db();
        return db.count(table);
    }

    async deleteRow<T extends TableName>(table: T, key: StorageKey): Promise<void> {
        const db = await this.db();
        await db.delete(table, key as never);
    }

    async deleteByPlaylistId(table: 'channels' | 'groups', playlistId: string): Promise<void> {
        const db = await this.db();
        // The stored second key part is a number for `channels` (index) and
        // a string for `groups` (name) — an empty array as the upper bound
        // works for both without the caller needing to know which: IDB's
        // key-comparison algorithm sorts arrays after every primitive type,
        // and a shorter array sorts before a longer one that shares its
        // prefix, so `[playlistId]` .. `[playlistId, []]` (upper exclusive)
        // spans every `[playlistId, <number-or-string>]` row and nothing
        // belonging to another playlist.
        const range = IDBKeyRange.bound([playlistId], [playlistId, []], false, true);
        await db.delete(table, range);
    }

    private async write(fn: (db: IDBPDatabase<ThunderTvDb>) => Promise<void>): Promise<WriteResult> {
        try {
            const db = await this.db();
            await fn(db);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: classifyIdbError(e) };
        }
    }
}

function toIdbRange(range: GetRangeOptions | undefined): IDBKeyRange | undefined {
    if (!range) return undefined;
    const { lower, upper } = range;
    if (lower !== undefined && upper !== undefined) return IDBKeyRange.bound(lower, upper);
    if (lower !== undefined) return IDBKeyRange.lowerBound(lower);
    if (upper !== undefined) return IDBKeyRange.upperBound(upper);
    return undefined;
}

/** Duck-types `.name` rather than `instanceof DOMException` — the same jsdom/Node realm-mismatch finding from Phase 03 applies equally to `fake-indexeddb`'s errors under Vitest (Feature 04.4.7). */
function classifyIdbError(e: unknown): 'quota' | 'io' {
    const name = typeof e === 'object' && e !== null && 'name' in e ? e.name : undefined;
    return name === 'QuotaExceededError' ? 'quota' : 'io';
}

/** No data in the message — only the diagnostic kind (Feature 04.4.8). */
function logDiagnostic(message: string): void {
    console.warn(`[ThunderTV] IndexedDB: ${message}`);
}
