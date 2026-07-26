import { afterEach, describe, expect, it } from 'vitest';
import { makeFavoriteRows } from './fixtures';
import { MemoryStorage } from './memory-storage';
import type { StorageAdapter, WriteResult } from './storage-adapter';
import { StorageTierController } from './tier-controller';

afterEach(() => {
    localStorage.clear();
});

/** Delegates every read (and, for the "carry-over" test, table ops too) to `inner` — spreading a class instance would silently drop its prototype methods, so every adapter here is written out explicitly. */
function wrapWithFailingWrites(
    inner: StorageAdapter,
    tier: StorageAdapter['tier'],
    failure: WriteResult,
): { adapter: StorageAdapter; calls: { writes: number } } {
    const calls = { writes: 0 };
    const adapter: StorageAdapter = {
        tier,
        get: inner.get.bind(inner),
        set: () => {
            calls.writes += 1;
            return Promise.resolve(failure);
        },
        getMany: inner.getMany.bind(inner),
        setMany: () => {
            calls.writes += 1;
            return Promise.resolve(failure);
        },
        delete: inner.delete.bind(inner),
        bulkPut: () => {
            calls.writes += 1;
            return Promise.resolve(failure);
        },
        getAll: inner.getAll.bind(inner),
        getRange: inner.getRange.bind(inner),
        clearTable: inner.clearTable.bind(inner),
        count: inner.count.bind(inner),
        deleteRow: inner.deleteRow.bind(inner),
        deleteByPlaylistId: inner.deleteByPlaylistId.bind(inner),
    };
    return { adapter, calls };
}

describe('StorageTierController', () => {
    it('delegates reads/writes to the active adapter when nothing fails', async () => {
        const controller = new StorageTierController(new MemoryStorage());
        expect(await controller.set('k', 'v')).toEqual({ ok: true });
        expect(await controller.get('k')).toBe('v');
        expect(controller.tier).toBe('none');
    });

    it('demotes full -> partial on a failing write, and the failure surfaces to the caller', async () => {
        const { adapter } = wrapWithFailingWrites(new MemoryStorage(), 'full', { ok: false, reason: 'io' });
        const controller = new StorageTierController(adapter);

        const result = await controller.set('k', 'v');
        expect(result).toEqual({ ok: false, reason: 'io' });
        expect(controller.tier).toBe('partial');
    });

    it('demotes partial -> none on a failing write', async () => {
        const { adapter } = wrapWithFailingWrites(new MemoryStorage(), 'partial', { ok: false, reason: 'budget' });
        const controller = new StorageTierController(adapter);

        await controller.bulkPut('favorites', makeFavoriteRows(1), (r) => r.id);
        expect(controller.tier).toBe('none');
    });

    it('never demotes past none (idempotent at the floor)', async () => {
        const controller = new StorageTierController(new MemoryStorage());
        await controller.set('k', 'v');
        expect(controller.tier).toBe('none');
    });

    it('concurrent failing writes share one demotion, not a cascading storm (Feature 04.7.8)', async () => {
        const { adapter, calls } = wrapWithFailingWrites(new MemoryStorage(), 'full', { ok: false, reason: 'io' });
        const controller = new StorageTierController(adapter);

        const [a, b, c] = await Promise.all([controller.set('a', 1), controller.set('b', 2), controller.set('c', 3)]);

        // Every concurrent call still reports its own failure honestly...
        expect(a).toEqual({ ok: false, reason: 'io' });
        expect(b).toEqual({ ok: false, reason: 'io' });
        expect(c).toEqual({ ok: false, reason: 'io' });
        // ...but the tier only drops one level, not three.
        expect(controller.tier).toBe('partial');
        expect(calls.writes).toBe(3);
    });

    it('carries favorites/recent/playlists over on demotion (Feature 04.7.4)', async () => {
        const inner = new MemoryStorage();
        await inner.bulkPut('favorites', makeFavoriteRows(3), (r) => r.id);
        const { adapter } = wrapWithFailingWrites(inner, 'full', { ok: false, reason: 'io' });
        const controller = new StorageTierController(adapter);

        await controller.set('trigger', 'demotion');
        expect(controller.tier).toBe('partial');
        expect(await controller.getAll('favorites')).toHaveLength(3);
    });

    it('calls onDemote with (from, to, reason)', async () => {
        const { adapter } = wrapWithFailingWrites(new MemoryStorage(), 'full', { ok: false, reason: 'io' });
        const events: [string, string, string][] = [];
        const controller = new StorageTierController(adapter, {
            onDemote: (from, to, reason) => events.push([from, to, reason]),
        });

        await controller.set('k', 'v');
        expect(events).toEqual([['full', 'partial', 'io']]);
    });
});
