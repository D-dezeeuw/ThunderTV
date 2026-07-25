import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChannelRows, makeFavoriteRows } from './fixtures';
import { LocalStorageStorage } from './local-storage-storage';

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('LocalStorageStorage — partial-tier policy (Feature 04.5.2)', () => {
    it('bulk tables survive within the session but are gone from a fresh instance (simulated reload)', async () => {
        const first = new LocalStorageStorage();
        await first.bulkPut('channels', makeChannelRows('p1', 5), (r) => [r.playlistId, r.index]);
        expect(await first.count('channels')).toBe(5);

        const afterReload = new LocalStorageStorage();
        expect(await afterReload.count('channels')).toBe(0);
    });

    it('persisted tables (favorites/recent/playlists) survive a fresh instance', async () => {
        const first = new LocalStorageStorage();
        await first.bulkPut('favorites', makeFavoriteRows(4), (r) => r.id);

        const afterReload = new LocalStorageStorage();
        expect(await afterReload.count('favorites')).toBe(4);
    });

    it('kv values (settings) survive a fresh instance', async () => {
        const first = new LocalStorageStorage();
        await first.set('theme', 'dark');

        const afterReload = new LocalStorageStorage();
        expect(await afterReload.get('theme')).toBe('dark');
    });
});

describe('LocalStorageStorage — quota guard (Feature 04.5.3)', () => {
    it('a QuotaExceededError on setItem resolves { ok: false, reason: "quota" } instead of throwing', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });
        const storage = new LocalStorageStorage();
        expect(await storage.set('k', 'v')).toEqual({ ok: false, reason: 'quota' });
    });
});

describe('LocalStorageStorage — byte budget (Feature 04.5.6)', () => {
    it('refuses a write that would exceed the ~5MB budget before the browser ever throws', async () => {
        const storage = new LocalStorageStorage();
        const oversized = 'x'.repeat(6 * 1024 * 1024);
        expect(await storage.set('huge', oversized)).toEqual({ ok: false, reason: 'budget' });
        expect(await storage.get('huge')).toBeUndefined();
    });
});

describe('LocalStorageStorage — chunking (Feature 04.5.4/04.5.5)', () => {
    it('round-trips a value larger than the chunk threshold', async () => {
        const storage = new LocalStorageStorage();
        const large = 'y'.repeat(200 * 1024); // > 64KB threshold
        await storage.set('big', large);
        expect(await storage.get('big')).toBe(large);
    });

    it('discards a value with a missing chunk instead of returning a truncated parse', async () => {
        const storage = new LocalStorageStorage();
        const large = 'z'.repeat(200 * 1024);
        await storage.set('big', large);

        // Simulate an interrupted write by deleting one chunk directly.
        localStorage.removeItem('tl:kv:big#1');

        expect(await storage.get('big')).toBeUndefined();
    });
});

describe('LocalStorageStorage — key isolation (Feature 04.5.8)', () => {
    it('never embeds a stored value in a localStorage key, even for playlist credentials', async () => {
        const storage = new LocalStorageStorage();
        await storage.bulkPut(
            'playlists',
            [
                {
                    v: 1,
                    id: 'p1',
                    type: 'xtream',
                    name: 'Test',
                    username: 'secretuser',
                    password: 'secretpass',
                    channelCount: 0,
                    lastRefresh: null,
                    etag: null,
                    lastModified: null,
                },
            ],
            (r) => r.id,
        );

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            expect(key).not.toContain('secretuser');
            expect(key).not.toContain('secretpass');
        }
    });
});
