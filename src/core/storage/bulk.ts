import type { StorageKey } from './keys';
import type { TableName, TableRowMap } from './records';
import type { StorageAdapter, WriteResult } from './storage-adapter';

/**
 * Matches the §5.10 worker chunk size — one constant, shared by the storage
 * layer now and the Phase 06/16 worker protocols later (Feature 04.6.1).
 */
export const CHUNK_ROWS = 5_000;

export interface ChunkedWriteProgress {
    written: number;
    total: number;
}

export interface ChunkedWriteResult {
    written: number;
    total: number;
    aborted: boolean;
    failure: WriteResult | null;
}

/**
 * Streams `rows` into `storage` in `CHUNK_ROWS`-row batches, yielding a
 * macrotask between batches so a 100k-row import interleaves with input
 * handling and rendering instead of blocking the main thread in one long
 * task (Feature 04.6.3). Stops on the first `{ ok: false }` batch (Feature
 * 04.6.5) or on `signal` abort (Feature 04.6.4) — either way, only whole
 * batches are ever written, never a partial one.
 */
export async function writeChunked<T extends TableName>(
    storage: StorageAdapter,
    table: T,
    rows: TableRowMap[T][],
    keyOf: (row: TableRowMap[T]) => StorageKey,
    options: { onProgress?: (progress: ChunkedWriteProgress) => void; signal?: AbortSignal } = {},
): Promise<ChunkedWriteResult> {
    const total = rows.length;
    let written = 0;

    for (let start = 0; start < rows.length; start += CHUNK_ROWS) {
        if (options.signal?.aborted) {
            return { written, total, aborted: true, failure: null };
        }

        const batch = rows.slice(start, start + CHUNK_ROWS);
        const result = await storage.bulkPut(table, batch, keyOf);
        if (!result.ok) {
            return { written, total, aborted: false, failure: result };
        }

        written += batch.length;
        options.onProgress?.({ written, total });

        if (start + CHUNK_ROWS < rows.length) {
            await yieldToMainThread();
        }
    }

    return { written, total, aborted: false, failure: null };
}

/**
 * The only sanctioned way to refresh a playlist's bulk rows (Feature
 * 04.6.6): clear the table, then write the new rows chunked. Sequential by
 * design — a failed clear must not be followed by a write into stale data.
 */
export async function replaceTableChunked<T extends TableName>(
    storage: StorageAdapter,
    table: T,
    rows: TableRowMap[T][],
    keyOf: (row: TableRowMap[T]) => StorageKey,
    options: { onProgress?: (progress: ChunkedWriteProgress) => void; signal?: AbortSignal } = {},
): Promise<ChunkedWriteResult> {
    await storage.clearTable(table);
    return writeChunked(storage, table, rows, keyOf, options);
}

function yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
