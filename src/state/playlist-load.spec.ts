/**
 * `loadPlaylistSources()` end to end against real (non-fake) storage tiers
 * — Feature 07.1.8's live projection and Feature 07.10.4/07.10.5's
 * partial/none-tier `needsReupload` semantics. "After reload" is modeled
 * the same way the Phase 04 storage specs already do it (`local-storage-storage.spec.ts`):
 * a fresh adapter instance — real `localStorage`/`indexedDB` persist across
 * instances exactly like a real page reload, while each adapter's
 * never-persisted in-memory overlay does not.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { resetState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlatform, resetPlatformForTests, setPlatform } from '../core/platform';
import { FakeDownloadAdapter, FakeFileAdapter, FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { IdbStorage } from '../core/storage/idb-storage';
import { LocalStorageStorage } from '../core/storage/local-storage-storage';
import { MemoryStorage } from '../core/storage/memory-storage';
import type { StorageAdapter } from '../core/storage/storage-adapter';
import { PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { loadPlaylistSources } from './playlist-load';
import { get } from './typed';

let lastStorage: StorageAdapter | null = null;

beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(async () => {
    // Clearing through the adapter (not a bare `localStorage` reference)
    // keeps this file outside src/core/** clean under the platform-API
    // fence (Feature 03.9) — real localStorage otherwise leaks playlists
    // rows across tests in this file.
    await lastStorage?.clearTable('playlists');
    lastStorage = null;
    vi.unstubAllGlobals();
    resetPlatformForTests();
    resetState();
});

function useStorage(storage: StorageAdapter): void {
    lastStorage = storage;
    resetPlatformForTests();
    setPlatform({
        name: 'web',
        http: new FakeHttpAdapter(),
        files: new FakeFileAdapter(),
        downloads: new FakeDownloadAdapter(),
        storage,
        capabilities: { corsUnrestricted: false, externalPlayers: false, durableStorage: storage.tier , downloads: 'none'},
    });
}

describe('loadPlaylistSources() (Feature 07.1.8)', () => {
    it('projects the playlists table into playlist.sources, one summary per record', async () => {
        useStorage(new MemoryStorage());
        const storage = getPlatform().storage;
        await storage.bulkPut(
            'playlists',
            [makePlaylistRecord({ id: 'a', name: 'A' }), makePlaylistRecord({ id: 'b', name: 'B' })],
            (r) => r.id,
        );

        await loadPlaylistSources();
        tick();

        const sources = get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES);
        expect(sources?.map((s) => s.name).sort()).toEqual(['A', 'B']);
    });

    it('full tier: needsReupload is always false, regardless of type', async () => {
        const storage = new IdbStorage();
        useStorage(storage);
        await storage.bulkPut(
            'playlists',
            [makePlaylistRecord({ id: 'a', type: 'm3u-file', channelCount: 500 })],
            (r) => r.id,
        );

        await loadPlaylistSources();
        tick();

        expect(get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES)?.[0]?.needsReupload).toBe(false);
    });

    it('partial tier after a real simulated reload: m3u-file/m3u-text need re-upload, m3u-url does not (Feature 07.10.4)', async () => {
        const before = new LocalStorageStorage();
        useStorage(before);
        await before.bulkPut(
            'playlists',
            [
                makePlaylistRecord({ id: 'file', type: 'm3u-file', channelCount: 500 }),
                makePlaylistRecord({ id: 'url', type: 'm3u-url', url: 'https://example.com/list.m3u', channelCount: 500 }),
            ],
            (r) => r.id,
        );
        // channels never persist on the partial tier even pre-reload
        // (Feature 04.5.2) — nothing to seed there.

        // Simulate reload: a fresh adapter instance reads real localStorage
        // back, with a clean (never-persisted) channels overlay.
        const afterReload = new LocalStorageStorage();
        useStorage(afterReload);

        await loadPlaylistSources();
        tick();

        const sources = get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES) ?? [];
        expect(sources).toHaveLength(2);
        const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
        expect(byId['file']?.needsReupload).toBe(true);
        expect(byId['url']?.needsReupload).toBe(false);
    });

    it('none tier: a simulated reload comes back with zero sources — the tier changes boot behavior, never feature behavior (Feature 07.10.5)', async () => {
        const before = new MemoryStorage();
        useStorage(before);
        await before.bulkPut('playlists', [makePlaylistRecord({ id: 'a' })], (r) => r.id);
        expect(await before.count('playlists')).toBe(1);

        // Memory has no real persistence layer at all — "reload" is simply
        // a fresh instance, which starts genuinely empty.
        const afterReload = new MemoryStorage();
        useStorage(afterReload);

        await loadPlaylistSources();
        tick();

        expect(get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES)).toEqual([]);
    });
});
