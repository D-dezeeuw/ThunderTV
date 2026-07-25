/**
 * The phase's proof (Feature 04.10): one behavioral suite, three adapters,
 * zero per-tier spec forks — plus the bulk/versioning/demotion specs that
 * only make sense running across the same three tiers.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_ROWS, replaceTableChunked, writeChunked } from './bulk';
import { makeChannelRows } from './fixtures';
import { IdbStorage } from './idb-storage';
import { LocalStorageStorage } from './local-storage-storage';
import { MemoryStorage } from './memory-storage';
import type { StorageAdapter } from './storage-adapter';
import { describeStorageContract } from './storage-contract.spec.ts';

beforeEach(() => {
    // fake-indexeddb persists its simulated databases across `new
    // IdbStorage()` instantiations within the same test file (matching real
    // IndexedDB: same DB name = same underlying storage) — a fresh factory
    // per test is what actually isolates tests from each other.
    vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
});

describeStorageContract('memory (tier: none)', () => new MemoryStorage());
describeStorageContract('localStorage (tier: partial)', () => new LocalStorageStorage());
describeStorageContract('IndexedDB via fake-indexeddb (tier: full)', () => new IdbStorage());

const TIERS: [string, () => StorageAdapter][] = [
    ['memory', () => new MemoryStorage()],
    ['localStorage (overlay — channels are never persisted, per Feature 04.5.2)', () => new LocalStorageStorage()],
    ['IndexedDB', () => new IdbStorage()],
];

describe('chunked bulk writes across tiers (Feature 04.10.3)', () => {
    for (const [name, make] of TIERS) {
        it(`writeChunked() covers exact chunk boundaries on ${name}`, async () => {
            const storage = make();
            const rows = makeChannelRows('p1', CHUNK_ROWS + 1); // one full chunk plus a partial second
            const progressCalls: number[] = [];

            const result = await writeChunked(storage, 'channels', rows, (r) => [r.playlistId, r.index], {
                onProgress: (p) => progressCalls.push(p.written),
            });

            expect(result).toEqual({ written: rows.length, total: rows.length, aborted: false, failure: null });
            expect(progressCalls).toEqual([CHUNK_ROWS, rows.length]);
            expect(await storage.count('channels')).toBe(rows.length);
        });

        it(`replaceTableChunked() clears before writing on ${name}`, async () => {
            const storage = make();
            await writeChunked(storage, 'channels', makeChannelRows('p1', 10), (r) => [r.playlistId, r.index]);
            expect(await storage.count('channels')).toBe(10);

            await replaceTableChunked(storage, 'channels', makeChannelRows('p1', 3), (r) => [r.playlistId, r.index]);
            expect(await storage.count('channels')).toBe(3);
        });

        it(`writeChunked() stops between chunks on abort, reporting rows written so far on ${name}`, async () => {
            const storage = make();
            const controller = new AbortController();
            const rows = makeChannelRows('p1', CHUNK_ROWS * 3);

            const result = await writeChunked(storage, 'channels', rows, (r) => [r.playlistId, r.index], {
                signal: controller.signal,
                onProgress: (p) => {
                    if (p.written === CHUNK_ROWS) controller.abort();
                },
            });

            expect(result.aborted).toBe(true);
            expect(result.written).toBe(CHUNK_ROWS);
            expect(await storage.count('channels')).toBe(CHUNK_ROWS);
        });
    }
});
