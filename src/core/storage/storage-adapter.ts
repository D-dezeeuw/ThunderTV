import type { StorageKey } from './keys';
import type { TableName, TableRowMap } from './records';

export type { TableName, StorageKey };

/**
 * Every write resolves this instead of throwing — quota/IO failures are
 * data, not exceptions, so a caller (ultimately the Feature 04.7 tier
 * controller) can react instead of the app white-screening (Feature 04.1.6).
 */
export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'io' | 'budget' };

export interface GetRangeOptions {
    lower?: StorageKey;
    upper?: StorageKey;
}

/**
 * One async interface, identical across tiers (Feature 04.1.1) — shaped so
 * a future Electron SQLite-over-IPC implementation is just a fourth class.
 * Every method is async even on tiers with a synchronous backing store
 * (`localStorage`, memory), so callers never branch on tier.
 *
 * Two distinct surfaces, never mixed (Feature 04.1.7):
 *  - `get`/`set`/`getMany`/`setMany`/`delete`: small keyed snapshots
 *    (individual settings, session state — Phase 05's persistence bridge).
 *  - `bulkPut`/`getAll`/`getRange`/`clearTable`/`count`: bulk table rows
 *    (channels, EPG programs, favorites, …).
 */
export interface StorageAdapter {
    readonly tier: 'full' | 'partial' | 'none';

    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<WriteResult>;
    /** Missing keys resolve `undefined` at their index — the result is always the same length as `keys`, in the same order (Feature 04.3.8). */
    getMany<T = unknown>(keys: string[]): Promise<(T | undefined)[]>;
    setMany<T = unknown>(entries: [key: string, value: T][]): Promise<WriteResult>;
    delete(key: string): Promise<void>;

    bulkPut<T extends TableName>(
        table: T,
        rows: TableRowMap[T][],
        keyOf: (row: TableRowMap[T]) => StorageKey,
    ): Promise<WriteResult>;
    getAll<T extends TableName>(table: T, range?: GetRangeOptions): Promise<TableRowMap[T][]>;
    getRange<T extends TableName>(table: T, lower: StorageKey, upper: StorageKey): Promise<TableRowMap[T][]>;
    clearTable(table: TableName): Promise<void>;
    count(table: TableName): Promise<number>;
    /** Deletes exactly one table row by its exact key (Feature 07.7.4's swap step — removing a superseded `PlaylistRecord`). A no-op if the key isn't present. */
    deleteRow<T extends TableName>(table: T, key: StorageKey): Promise<void>;
    /**
     * Deletes every row of a composite-keyed table (`channels`/`groups`)
     * whose key's first part is `playlistId` — the single-ranged-delete
     * Feature 07.9.3/07.9.5 needs for staging cleanup and Feature 07.9.7's
     * boot-time orphan sweep. Never called with `playlists`/`favorites`/
     * `recent` (single-string-keyed tables have no playlistId prefix to
     * bound on) — callers pass only `'channels' | 'groups'`.
     */
    deleteByPlaylistId(table: 'channels' | 'groups', playlistId: string): Promise<void>;
}
