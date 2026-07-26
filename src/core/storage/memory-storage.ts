import { encodeKey, playlistIdKeyPrefix, type StorageKey } from './keys';
import type { TableName, TableRowMap } from './records';
import type { GetRangeOptions, StorageAdapter, WriteResult } from './storage-adapter';

/**
 * The reference implementation (Feature 04.3): defines correct behavior for
 * every operation. `IdbStorage` and `LocalStorageStorage` must pass the
 * exact same behavioral suite (`storage-contract.spec.ts`) unchanged.
 *
 * Also the `tier: 'none'` adapter for real use — nothing survives a reload,
 * by design, when both probes fail.
 */
export class MemoryStorage implements StorageAdapter {
    readonly tier = 'none' as const;

    private readonly kv = new Map<string, unknown>();
    private readonly tables = new Map<TableName, Map<string, unknown>>();

    get<T = unknown>(key: string): Promise<T | undefined> {
        return Promise.resolve(cloneOrUndefined<T>(this.kv.get(key)));
    }

    set<T = unknown>(key: string, value: T): Promise<WriteResult> {
        this.kv.set(key, structuredClone(value));
        return Promise.resolve({ ok: true });
    }

    getMany<T = unknown>(keys: string[]): Promise<(T | undefined)[]> {
        return Promise.resolve(keys.map((key) => cloneOrUndefined<T>(this.kv.get(key))));
    }

    setMany<T = unknown>(entries: [key: string, value: T][]): Promise<WriteResult> {
        for (const [key, value] of entries) this.kv.set(key, structuredClone(value));
        return Promise.resolve({ ok: true });
    }

    delete(key: string): Promise<void> {
        this.kv.delete(key);
        return Promise.resolve();
    }

    bulkPut<T extends TableName>(
        table: T,
        rows: TableRowMap[T][],
        keyOf: (row: TableRowMap[T]) => StorageKey,
    ): Promise<WriteResult> {
        const store = this.tableStore(table);
        for (const row of rows) store.set(encodeKey(keyOf(row)), structuredClone(row));
        return Promise.resolve({ ok: true });
    }

    getAll<T extends TableName>(table: T, range?: GetRangeOptions): Promise<TableRowMap[T][]> {
        if (!range) {
            return Promise.resolve(this.allRows(table));
        }
        const lowerKey = range.lower !== undefined ? encodeKey(range.lower) : undefined;
        const upperKey = range.upper !== undefined ? encodeKey(range.upper) : undefined;
        return Promise.resolve(this.sortedRows(table, lowerKey, upperKey));
    }

    getRange<T extends TableName>(table: T, lower: StorageKey, upper: StorageKey): Promise<TableRowMap[T][]> {
        return Promise.resolve(this.sortedRows(table, encodeKey(lower), encodeKey(upper)));
    }

    clearTable(table: TableName): Promise<void> {
        this.tables.delete(table);
        return Promise.resolve();
    }

    count(table: TableName): Promise<number> {
        return Promise.resolve(this.tableStore(table).size);
    }

    deleteRow<T extends TableName>(table: T, key: StorageKey): Promise<void> {
        this.tableStore(table).delete(encodeKey(key));
        return Promise.resolve();
    }

    deleteByPlaylistId(table: 'channels' | 'groups', playlistId: string): Promise<void> {
        const store = this.tableStore(table);
        const prefix = playlistIdKeyPrefix(playlistId);
        for (const key of store.keys()) {
            if (key.startsWith(prefix)) store.delete(key);
        }
        return Promise.resolve();
    }

    private tableStore(table: TableName): Map<string, unknown> {
        let store = this.tables.get(table);
        if (!store) {
            store = new Map();
            this.tables.set(table, store);
        }
        return store;
    }

    /** `[encodedKey, row]` pairs sorted by encoded key — the single source of iteration order every read method builds on. */
    private sortedEntries<T extends TableName>(table: T): [string, TableRowMap[T]][] {
        return [...this.tableStore(table).entries()]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, row]) => [key, row as TableRowMap[T]]);
    }

    private allRows<T extends TableName>(table: T): TableRowMap[T][] {
        return this.sortedEntries(table).map(([, row]) => structuredClone(row));
    }

    private sortedRows<T extends TableName>(
        table: T,
        lowerKey: string | undefined,
        upperKey: string | undefined,
    ): TableRowMap[T][] {
        return this.sortedEntries(table)
            .filter(([key]) => (lowerKey === undefined || key >= lowerKey) && (upperKey === undefined || key <= upperKey))
            .map(([, row]) => structuredClone(row));
    }
}

function cloneOrUndefined<T>(value: unknown): T | undefined {
    return value === undefined ? undefined : structuredClone(value as T);
}
