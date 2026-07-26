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
