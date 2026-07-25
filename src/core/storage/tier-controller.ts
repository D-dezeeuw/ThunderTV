import { LocalStorageStorage } from './local-storage-storage';
import type { StorageKey } from './keys';
import { MemoryStorage } from './memory-storage';
import type { TableName, TableRowMap } from './records';
import type { GetRangeOptions, StorageAdapter, WriteResult } from './storage-adapter';

export type DemotionReason = 'quota' | 'io' | 'budget';

const CARRY_OVER_TABLES: readonly TableName[] = ['playlists', 'favorites', 'recent'];

export interface TierControllerOptions {
    onDemote?: ((from: StorageAdapter['tier'], to: StorageAdapter['tier'], reason: DemotionReason) => void) | undefined;
}

/**
 * Wraps the active `StorageAdapter` and demotes it — full → partial → none,
 * one direction only, never mid-session promotion (Feature 04.7.1) — the
 * moment any write reports `{ ok: false }`. Every downstream caller reaches
 * storage exclusively through `getPlatform().storage`, which *is* this
 * controller once Phase 04 wires it in, so no caller ever holds a stale
 * direct adapter reference across a demotion (Feature 04.7.3).
 */
export class StorageTierController implements StorageAdapter {
    private active: StorageAdapter;
    private readonly onDemote: TierControllerOptions['onDemote'];
    private demotionInFlight: Promise<void> | null = null;

    constructor(initial: StorageAdapter, options: TierControllerOptions = {}) {
        this.active = initial;
        this.onDemote = options.onDemote;
    }

    get tier(): StorageAdapter['tier'] {
        return this.active.tier;
    }

    get<T = unknown>(key: string): Promise<T | undefined> {
        return this.active.get(key);
    }

    async set<T = unknown>(key: string, value: T): Promise<WriteResult> {
        return this.runWrite(() => this.active.set(key, value));
    }

    getMany<T = unknown>(keys: string[]): Promise<(T | undefined)[]> {
        return this.active.getMany(keys);
    }

    async setMany<T = unknown>(entries: [key: string, value: T][]): Promise<WriteResult> {
        return this.runWrite(() => this.active.setMany(entries));
    }

    delete(key: string): Promise<void> {
        return this.active.delete(key);
    }

    async bulkPut<T extends TableName>(
        table: T,
        rows: TableRowMap[T][],
        keyOf: (row: TableRowMap[T]) => StorageKey,
    ): Promise<WriteResult> {
        return this.runWrite(() => this.active.bulkPut(table, rows, keyOf));
    }

    getAll<T extends TableName>(table: T, range?: GetRangeOptions): Promise<TableRowMap[T][]> {
        return this.active.getAll(table, range);
    }

    getRange<T extends TableName>(table: T, lower: StorageKey, upper: StorageKey): Promise<TableRowMap[T][]> {
        return this.active.getRange(table, lower, upper);
    }

    clearTable(table: TableName): Promise<void> {
        return this.active.clearTable(table);
    }

    count(table: TableName): Promise<number> {
        return this.active.count(table);
    }

    /** Every failing write routes here (Feature 04.7.2). Concurrent failures share one in-flight demotion — Feature 04.7.8's "no double-demotion storm" — rather than each independently walking the ladder. */
    private async runWrite(write: () => Promise<WriteResult>): Promise<WriteResult> {
        const result = await write();
        if (!result.ok) await this.demote(result.reason);
        return result;
    }

    private demote(reason: DemotionReason): Promise<void> {
        this.demotionInFlight ??= this.performDemote(reason).finally(() => {
            this.demotionInFlight = null;
        });
        return this.demotionInFlight;
    }

    private async performDemote(reason: DemotionReason): Promise<void> {
        const from = this.active.tier;
        if (from === 'none') return; // already at the floor — nothing to do

        const to = from === 'full' ? 'partial' : 'none';
        const carried: Partial<Record<TableName, unknown>> = {};
        for (const table of CARRY_OVER_TABLES) {
            carried[table] = await this.active.getAll(table);
        }

        const next: StorageAdapter = to === 'partial' ? new LocalStorageStorage() : new MemoryStorage();
        for (const table of CARRY_OVER_TABLES) {
            const rows = carried[table] as TableRowMap[TableName][] | undefined;
            if (rows && rows.length > 0) {
                // Carried rows already have an `id` field on every persisted
                // table's row type (Feature 04.7.4) — see records.ts.
                await next.bulkPut(table, rows, (row) => (row as { id: string }).id);
            }
        }

        this.active = next;
        console.warn(`[ThunderTV] storage: demoted ${from} → ${to} (reason: ${reason})`);
        this.onDemote?.(from, to, reason);
    }
}
