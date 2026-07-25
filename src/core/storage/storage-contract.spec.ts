/**
 * One behavioral suite, run against every tier (Feature 04.1.9/04.3.7).
 * `storage-matrix.spec.ts` invokes `describeStorageContract` again for all
 * three real tiers; this file runs it once more, directly, against
 * `MemoryStorage` — the reference implementation (Feature 04.3.7: "run it
 * against MemoryStorage first"). The memory tier's contract therefore runs
 * twice across the suite; harmless, and it keeps this file from being an
 * empty `*.spec.ts` file with no tests of its own.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeEpgProgramRows, makeFavoriteRows } from './fixtures';
import { MemoryStorage } from './memory-storage';
import type { StorageAdapter } from './storage-adapter';

export function describeStorageContract(
    tierName: string,
    makeAdapter: () => StorageAdapter | Promise<StorageAdapter>,
): void {
    describe(`StorageAdapter contract (${tierName})`, () => {
        let storage: StorageAdapter;

        beforeEach(async () => {
            storage = await makeAdapter();
        });

        describe('kv', () => {
            it('round-trips a value', async () => {
                await storage.set('k', { a: 1 });
                expect(await storage.get('k')).toEqual({ a: 1 });
            });

            it('resolves undefined for a missing key', async () => {
                expect(await storage.get('missing')).toBeUndefined();
            });

            it('set() resolves { ok: true }', async () => {
                expect(await storage.set('k', 1)).toEqual({ ok: true });
            });

            it('delete() removes the value', async () => {
                await storage.set('k', 1);
                await storage.delete('k');
                expect(await storage.get('k')).toBeUndefined();
            });

            it('getMany() returns values in input order with undefined holes for missing keys (Feature 04.3.8)', async () => {
                await storage.set('a', 1);
                await storage.set('c', 3);
                expect(await storage.getMany(['a', 'b', 'c'])).toEqual([1, undefined, 3]);
            });

            it('setMany() writes every entry', async () => {
                await storage.setMany([
                    ['a', 1],
                    ['b', 2],
                ]);
                expect(await storage.getMany(['a', 'b'])).toEqual([1, 2]);
            });

            it('clone isolation: mutating a returned value never affects the stored value (Feature 04.3.3)', async () => {
                const value = { nested: { n: 1 } };
                await storage.set('k', value);
                const read1 = await storage.get<typeof value>('k');
                if (read1) read1.nested.n = 999;
                const read2 = await storage.get<typeof value>('k');
                expect(read2?.nested.n).toBe(1);
            });

            it('clone isolation on write: mutating the caller-supplied value after set() never affects storage', async () => {
                const value = { n: 1 };
                await storage.set('k', value);
                value.n = 999;
                expect((await storage.get<typeof value>('k'))?.n).toBe(1);
            });
        });

        describe('bulk tables', () => {
            it('bulkPut() upserts by key (Feature 04.3.5)', async () => {
                const rows = makeFavoriteRows(2);
                await storage.bulkPut('favorites', rows, (r) => r.id);
                await storage.bulkPut('favorites', [{ ...rows[0]!, name: 'Updated' }], (r) => r.id);

                const all = await storage.getAll('favorites');
                expect(all).toHaveLength(2);
                expect(all.find((r) => r.id === rows[0]!.id)?.name).toBe('Updated');
            });

            it('count() reflects the row count; clearTable() resets it to 0 (Feature 04.3.5)', async () => {
                await storage.bulkPut('favorites', makeFavoriteRows(3), (r) => r.id);
                expect(await storage.count('favorites')).toBe(3);
                await storage.clearTable('favorites');
                expect(await storage.count('favorites')).toBe(0);
                expect(await storage.getAll('favorites')).toEqual([]);
            });

            it('getAll() returns every row', async () => {
                await storage.bulkPut('favorites', makeFavoriteRows(5), (r) => r.id);
                expect(await storage.getAll('favorites')).toHaveLength(5);
            });

            it('clone isolation on table rows too', async () => {
                await storage.bulkPut('favorites', makeFavoriteRows(1), (r) => r.id);
                const [row] = await storage.getAll('favorites');
                if (row) row.name = 'mutated';
                const [reread] = await storage.getAll('favorites');
                expect(reread?.name).not.toBe('mutated');
            });

            it('bulkPut() resolves { ok: true } on success', async () => {
                expect(await storage.bulkPut('favorites', makeFavoriteRows(1), (r) => r.id)).toEqual({ ok: true });
            });
        });

        describe('range queries', () => {
            it('getRange() returns only rows within [lower, upper] inclusive, in order', async () => {
                const rows = makeEpgProgramRows('ch1', 10);
                await storage.bulkPut('epgPrograms', rows, (r) => [r.channelId, r.start]);

                const middle = await storage.getRange('epgPrograms', ['ch1', rows[2]!.start], ['ch1', rows[6]!.start]);
                expect(middle.map((r) => r.start)).toEqual(rows.slice(2, 7).map((r) => r.start));
            });

            it('getRange() never returns rows from a different composite-key prefix', async () => {
                await storage.bulkPut('epgPrograms', makeEpgProgramRows('ch1', 3), (r) => [r.channelId, r.start]);
                await storage.bulkPut('epgPrograms', makeEpgProgramRows('ch2', 3, 1_000_000), (r) => [
                    r.channelId,
                    r.start,
                ]);

                const ch1Rows = await storage.getRange('epgPrograms', ['ch1', 0], ['ch1', Number.MAX_SAFE_INTEGER]);
                expect(ch1Rows.every((r) => r.channelId === 'ch1')).toBe(true);
            });

            it('getAll() with a range option matches getRange()', async () => {
                const rows = makeEpgProgramRows('ch1', 5);
                await storage.bulkPut('epgPrograms', rows, (r) => [r.channelId, r.start]);

                const viaRange = await storage.getRange('epgPrograms', ['ch1', rows[1]!.start], ['ch1', rows[3]!.start]);
                const viaGetAll = await storage.getAll('epgPrograms', {
                    lower: ['ch1', rows[1]!.start],
                    upper: ['ch1', rows[3]!.start],
                });
                expect(viaGetAll).toEqual(viaRange);
            });
        });
    });
}

describeStorageContract('memory (reference implementation)', () => new MemoryStorage());
