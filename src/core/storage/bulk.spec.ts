import { describe, expect, it } from 'vitest';
import { CHUNK_ROWS, replaceTableChunked, writeChunked } from './bulk';
import { makeChannelRows } from './fixtures';
import { MemoryStorage } from './memory-storage';
import type { StorageAdapter } from './storage-adapter';

const keyOf = (r: { playlistId: string; index: number }) => [r.playlistId, r.index];

/** Delegates every method to `inner` except `bulkPut` — spreading a class instance would silently drop its prototype methods, so this wraps explicitly instead. */
function withOverriddenBulkPut(inner: StorageAdapter, bulkPut: StorageAdapter['bulkPut']): StorageAdapter {
    return {
        tier: inner.tier,
        get: inner.get.bind(inner),
        set: inner.set.bind(inner),
        getMany: inner.getMany.bind(inner),
        setMany: inner.setMany.bind(inner),
        delete: inner.delete.bind(inner),
        bulkPut,
        getAll: inner.getAll.bind(inner),
        getRange: inner.getRange.bind(inner),
        clearTable: inner.clearTable.bind(inner),
        count: inner.count.bind(inner),
    };
}

describe('writeChunked() exact chunk boundaries (Feature 04.6.9)', () => {
    it.each([CHUNK_ROWS - 1, CHUNK_ROWS, CHUNK_ROWS + 1])('%i rows', async (count) => {
        const storage = new MemoryStorage();
        const rows = makeChannelRows('p1', count);
        const expectedChunkCount = Math.ceil(count / CHUNK_ROWS);
        const progressCalls: number[] = [];

        const result = await writeChunked(storage, 'channels', rows, keyOf, {
            onProgress: (p) => progressCalls.push(p.written),
        });

        expect(result).toEqual({ written: count, total: count, aborted: false, failure: null });
        expect(progressCalls).toHaveLength(expectedChunkCount);
        expect(progressCalls[progressCalls.length - 1]).toBe(count);
        expect(await storage.count('channels')).toBe(count);
    });
});

describe('writeChunked() abort/failure handling', () => {
    it('stops between chunks on abort and reports rows written so far', async () => {
        const storage = new MemoryStorage();
        const rows = makeChannelRows('p1', CHUNK_ROWS * 3);
        const controller = new AbortController();

        const result = await writeChunked(storage, 'channels', rows, keyOf, {
            signal: controller.signal,
            onProgress: (p) => {
                if (p.written === CHUNK_ROWS) controller.abort();
            },
        });

        expect(result).toEqual({ written: CHUNK_ROWS, total: rows.length, aborted: true, failure: null });
    });

    it('halts on the first failing batch and reports the failure without retrying', async () => {
        let calls = 0;
        const failing = withOverriddenBulkPut(new MemoryStorage(), () => {
            calls += 1;
            return Promise.resolve({ ok: false, reason: 'quota' });
        });

        const result = await writeChunked(failing, 'channels', makeChannelRows('p1', CHUNK_ROWS * 2), keyOf);

        expect(result).toEqual({ written: 0, total: CHUNK_ROWS * 2, aborted: false, failure: { ok: false, reason: 'quota' } });
        expect(calls).toBe(1);
    });

    it('never writes a partial batch — only whole CHUNK_ROWS-sized batches land before a failure', async () => {
        const storage = new MemoryStorage();
        let call = 0;
        const spying = withOverriddenBulkPut(storage, (table, rows, ko) => {
            call += 1;
            if (call === 2) return Promise.resolve({ ok: false, reason: 'io' });
            return storage.bulkPut(table, rows, ko);
        });

        await writeChunked(spying, 'channels', makeChannelRows('p1', CHUNK_ROWS * 3), keyOf);
        expect(await storage.count('channels')).toBe(CHUNK_ROWS);
    });
});

describe('replaceTableChunked()', () => {
    it('clears the table before writing the replacement rows', async () => {
        const storage = new MemoryStorage();
        await writeChunked(storage, 'channels', makeChannelRows('p1', 20), keyOf);
        expect(await storage.count('channels')).toBe(20);

        await replaceTableChunked(storage, 'channels', makeChannelRows('p1', 5), keyOf);
        expect(await storage.count('channels')).toBe(5);
    });
});
