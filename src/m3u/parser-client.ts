import type { ChannelRecord } from '../core/storage';
import { getPlatform } from '../core/platform';
import { setRows } from './channel-memory';
import type { ChannelRow, GroupMeta } from './types';
import type { WorkerIn, WorkerOut } from './worker-protocol';

export interface ParseSummary {
    total: number;
    groups: GroupMeta[];
    radioCount: number;
    drmCount: number;
    skipped: number;
}

export interface ParserClientCallbacks {
    onProgress?: (parsed: number) => void;
    onChunk?: (rows: readonly ChannelRow[], done: boolean) => void;
}

/**
 * Main-thread client wrapping the parser worker (Feature 06.3.3). The
 * worker itself is Spektrum/DOM-free (Feature 06.3.5); this is the one
 * place that bridges its typed messages to storage writes and the
 * module-memory query layer. Deliberately no Spektrum import here either —
 * Phase 07's real import flow owns calling `setValue('playlist.importProgress', ...)`
 * from these callbacks (Feature 06.4.7's contract is "compact scalars
 * only," decided at the call site that actually owns that key; inventing
 * the write here would be exactly the speculative-shape problem Phase 05
 * already flagged for `playlist.importProgress`).
 *
 * Writing to storage never clears the `channels` table first — `clearTable`
 * has no playlist scoping (it would wipe every imported playlist's rows,
 * not just this one), so a real playlist-replace policy is Phase 07's
 * scope, not this client's.
 */
export class ParserClient {
    private worker: Worker;
    private inFlight = false;

    constructor() {
        this.worker = ParserClient.createWorker();
    }

    private static createWorker(): Worker {
        return new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    }

    /**
     * Parses `text` for `sourceId`. Each arriving chunk is written straight
     * to the `channels` storage table (Feature 06.4.6 — no main-thread
     * buffering for the storage write itself); chunks are additionally
     * accumulated into `channel-memory.ts`'s module-memory array once, after
     * the last one (Feature 06.8.3's sanctioned exception to "never
     * accumulate" — that's exactly where the full array is supposed to
     * live). Chunk processing is serialized through `chunkQueue` so
     * concurrent `bulkPut` calls can never race and misassign storage
     * indices if messages arrive faster than a write resolves.
     *
     * Rejects if a parse is already in flight (Feature 06.3.4) — call
     * `cancel()` first.
     */
    async parse(
        text: string,
        sourceId: string,
        callbacks: ParserClientCallbacks = {},
    ): Promise<ParseSummary> {
        if (this.inFlight) {
            throw new Error(
                'ParserClient.parse(): a parse is already in flight — call cancel() first.',
            );
        }
        this.inFlight = true;

        try {
            return await this.runParse(text, sourceId, callbacks);
        } finally {
            this.inFlight = false;
        }
    }

    private runParse(
        text: string,
        sourceId: string,
        callbacks: ParserClientCallbacks,
    ): Promise<ParseSummary> {
        const allRows: ChannelRow[] = [];
        let nextIndex = 0;
        let chunkQueue: Promise<void> = Promise.resolve();

        return new Promise<ParseSummary>((resolve, reject) => {
            const cleanup = (): void => this.worker.removeEventListener('message', handleMessage);

            const handleMessage = (event: MessageEvent<WorkerOut>): void => {
                const message = event.data;
                switch (message.type) {
                    case 'progress':
                        callbacks.onProgress?.(message.parsed);
                        return;
                    case 'chunk': {
                        const startIndex = nextIndex;
                        nextIndex += message.rows.length;
                        chunkQueue = chunkQueue
                            .then(() => writeChunkToStorage(sourceId, message.rows, startIndex))
                            .then(() => {
                                allRows.push(...message.rows);
                                callbacks.onChunk?.(message.rows, message.done);
                            });
                        return;
                    }
                    case 'summary':
                        cleanup();
                        void chunkQueue.then(() => {
                            setRows(allRows);
                            resolve({
                                total: message.total,
                                groups: message.groups,
                                radioCount: message.radioCount,
                                drmCount: message.drmCount,
                                skipped: message.skipped,
                            });
                        });
                        return;
                    case 'error':
                        cleanup();
                        reject(new Error(message.message));
                        return;
                }
            };

            this.worker.addEventListener('message', handleMessage);
            const input: WorkerIn = { type: 'parse', text, sourceId };
            this.worker.postMessage(input);
        });
    }

    /** Terminates and re-instantiates the worker (Feature 06.3.4) — Phase 07 wires this to a real cancel affordance. */
    cancel(): void {
        this.worker.terminate();
        this.worker = ParserClient.createWorker();
        this.inFlight = false;
    }
}

function toChannelRecord(row: ChannelRow, playlistId: string, index: number): ChannelRecord {
    return {
        playlistId,
        index,
        name: row.name,
        url: row.url,
        logo: row.logo,
        group: row.group,
        tvgId: row.tvgId,
        radio: row.radio,
        ...(row.drm ? { drm: row.drm } : {}),
    };
}

async function writeChunkToStorage(
    sourceId: string,
    rows: readonly ChannelRow[],
    startIndex: number,
): Promise<void> {
    if (rows.length === 0) return;
    const records = rows.map((row, i) => toChannelRecord(row, sourceId, startIndex + i));
    await getPlatform().storage.bulkPut('channels', records, (record) => [
        record.playlistId,
        record.index,
    ]);
}
