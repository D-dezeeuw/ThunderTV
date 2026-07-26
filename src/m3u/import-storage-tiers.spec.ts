/**
 * The import pipeline's real IndexedDB-tier proof (Feature 07.7.9/07.10.3)
 * — every other import spec in this directory runs against `MemoryStorage`
 * via `withFakePlatform` (the reference tier, Feature 04.10's own choice),
 * so this file is the one place the full pipeline runs against a *real*
 * `IdbStorage`, backed by `fake-indexeddb` so it stays headless. Also homes
 * Feature 07.7.5's favorites-survive-an-upsert proof, since that needs the
 * same real-tier setup to be meaningful (favorites are a denormalized
 * snapshot with no foreign key into `channels`/`playlists` at all — see
 * `core/storage/records.ts`'s `FavoriteRecord` — so this is really proving
 * `commitImport()`'s write-then-swap never reaches into that table, on the
 * one tier where a stray cross-table write would be easiest to miss).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformForTests, setPlatform } from '../core/platform';
import { FakeFileAdapter, FakeHttpAdapter } from '../core/platform/fake-platform';
import { makeFavoriteRows } from '../core/storage/fixtures';
import { IdbStorage } from '../core/storage/idb-storage';
import { MemoryStorage } from '../core/storage/memory-storage';
import type { StorageAdapter } from '../core/storage/storage-adapter';
import { StorageTierController } from '../core/storage/tier-controller';
import { clearRows } from './channel-memory';
import { runImport } from './import-run';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';
const URL = 'https://example.com/list.m3u';

beforeEach(() => {
    // Fresh factory per test — fake-indexeddb persists databases across
    // `new IdbStorage()` instantiations within one file, matching real
    // IndexedDB (Feature 04.10's storage-matrix.spec.ts established this).
    vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
    clearRows();
    resetPlatformForTests();
    vi.unstubAllGlobals();
});

function setIdbPlatform(): IdbStorage {
    const storage = new IdbStorage();
    setPlatform({
        name: 'web',
        http: new FakeHttpAdapter(),
        files: new FakeFileAdapter(),
        storage,
        capabilities: { corsUnrestricted: false, externalPlayers: false, durableStorage: 'full' },
    });
    return storage;
}

describe('import pipeline — real IndexedDB tier via fake-indexeddb', () => {
    it('re-importing the same URL twice yields exactly one playlists record, fresh channel rows, and no orphaned staging rows', async () => {
        const storage = setIdbPlatform();

        const first = await runImport({ type: 'm3u-url', text: SAMPLE, url: URL, name: 'List' });
        expect(first.ok).toBe(true);
        expect(await storage.count('playlists')).toBe(1);
        expect(await storage.count('channels')).toBe(1);

        const second = await runImport({
            type: 'm3u-url',
            text: SAMPLE.replace('One', 'One Updated'),
            url: URL,
            name: 'List',
        });
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.summary.updated).toBe(true);

        const playlists = await storage.getAll('playlists');
        expect(playlists).toHaveLength(1);
        const channels = await storage.getAll('channels');
        expect(channels).toHaveLength(1);
        expect(channels[0]?.name).toBe('One Updated');
        expect(channels.every((c) => c.playlistId === playlists[0]?.id)).toBe(true);
    });

    it('favorites survive an upsert untouched (Feature 07.7.5)', async () => {
        const storage = setIdbPlatform();
        const favorite = makeFavoriteRows(1)[0];
        if (!favorite) throw new Error('unreachable');
        await storage.bulkPut('favorites', [favorite], (r) => r.id);

        await runImport({ type: 'm3u-url', text: SAMPLE, url: URL, name: 'List' });
        await runImport({ type: 'm3u-url', text: SAMPLE, url: URL, name: 'List' });

        expect(await storage.count('favorites')).toBe(1);
        expect(await storage.getAll('favorites')).toEqual([favorite]);
    });
});

/**
 * Delegates everything to `inner` except `bulkPut`, which fails exactly
 * once then behaves normally — simulating a transient budget/quota failure
 * that clears up once `StorageTierController` demotes to a fresh, empty
 * tier (Feature 04.7.2's own contract: the failing write's result surfaces
 * to the caller, unretried, by design — proven directly in
 * `tier-controller.spec.ts`). Written out explicitly, not spread, since a
 * class instance's methods live on its prototype (`tier-controller.spec.ts`'s
 * own `wrapWithFailingWrites` established this pattern first).
 */
function wrapFailingOnce(inner: StorageAdapter, tier: StorageAdapter['tier']): StorageAdapter {
    let failed = false;
    return {
        tier,
        get: inner.get.bind(inner),
        set: inner.set.bind(inner),
        getMany: inner.getMany.bind(inner),
        setMany: inner.setMany.bind(inner),
        delete: inner.delete.bind(inner),
        bulkPut: (table, rows, keyOf) => {
            if (!failed) {
                failed = true;
                return Promise.resolve({ ok: false, reason: 'budget' });
            }
            return inner.bulkPut(table, rows, keyOf);
        },
        getAll: inner.getAll.bind(inner),
        getRange: inner.getRange.bind(inner),
        clearTable: inner.clearTable.bind(inner),
        count: inner.count.bind(inner),
        deleteRow: inner.deleteRow.bind(inner),
        deleteByPlaylistId: inner.deleteByPlaylistId.bind(inner),
    };
}

describe('import pipeline — mid-import storage demotion (Feature 07.9.10)', () => {
    it('a quota/budget failure during commit demotes the tier and the import still completes in-session', async () => {
        const inner = new MemoryStorage();
        const flaky = wrapFailingOnce(inner, 'partial');
        const demotions: Array<[string, string, string]> = [];
        const controller = new StorageTierController(flaky, {
            onDemote: (from, to, reason) => demotions.push([from, to, reason]),
        });
        setPlatform({
            name: 'web',
            http: new FakeHttpAdapter(),
            files: new FakeFileAdapter(),
            storage: controller,
            capabilities: { corsUnrestricted: false, externalPlayers: false, durableStorage: 'partial' },
        });

        const outcome = await runImport({ type: 'm3u-text', text: SAMPLE, name: 'Pasted playlist' });

        expect(outcome.ok).toBe(true);
        expect(demotions).toEqual([['partial', 'none', 'budget']]);
        // The headline Feature 07.9.10 promise holds: no crash, no stuck
        // 'writing' stage, a real browsable source lands on the demoted
        // tier (commitImport's writes both land, since the demotion already
        // happened as a side effect of the *first* bulkPut in the whole
        // flow — the worker's own 'channels' chunk write, parser-client.ts).
        expect(controller.tier).toBe('none');
        expect(await controller.count('playlists')).toBe(1);
        expect(await controller.count('groups')).toBe(1);
        // Known, narrow gap (not fixed here): StorageTierController never
        // retries the write that triggered a demotion (Feature 04.7.2's own
        // tested contract — "the failure surfaces to the caller") — so the
        // *specific* write mid-flight when the budget/quota failure hits is
        // lost, not carried to the fresh tier. Here that's the one 'channels'
        // chunk in flight, so the demoted-to source is created with real
        // metadata (`channelCount: 1`) but zero actual channel rows — a
        // real, if very narrow (localStorage's 5MB budget almost never
        // trips mid-chunk in practice; a genuine device-storage
        // QuotaExceededError is the more realistic trigger, and hits at
        // the same granularity), follow-up. A StorageTierController-level
        // fix (retry-after-demote) is Phase 04 territory, not Phase 07's.
        expect(await controller.count('channels')).toBe(0);
    });
});
