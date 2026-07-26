import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { cleanupStaging, commitImport, findExistingByFingerprint, findExistingByKey, sourceKeyFor } from './import-commit';
import type { ParseSummary } from './parser-client';

function summary(overrides: Partial<ParseSummary> = {}): ParseSummary {
    return {
        total: 2,
        groups: [{ name: 'News', count: 2, firstIndex: 0 }],
        radioCount: 0,
        drmCount: 0,
        skipped: 0,
        detectedEpgUrls: [],
        ...overrides,
    };
}

describe('import-commit (Feature 07.7)', () => {
    afterEach(() => {
        resetPlatformForTests();
    });

    it('sourceKeyFor delegates to makeSourceKey', () => {
        expect(sourceKeyFor('m3u-url', 'https://example.com/list.m3u')).toBe('m3u-url:https://example.com/list.m3u');
        expect(sourceKeyFor('m3u-file', undefined)).toBeNull();
    });

    it('findExistingByKey returns undefined when nothing matches', async () => {
        await withFakePlatform({}, async () => {
            expect(await findExistingByKey('m3u-url:https://example.com/list.m3u')).toBeUndefined();
        });
    });

    it('findExistingByKey finds a stored playlist with a matching normalized key', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const existing = makePlaylistRecord({ id: 'old', url: 'https://Example.com/list.m3u/' });
            await storage.bulkPut('playlists', [existing], (r) => r.id);

            const found = await findExistingByKey(sourceKeyFor('m3u-url', 'https://example.com/list.m3u'));
            expect(found?.id).toBe('old');
        });
    });

    it('findExistingByFingerprint matches a stored file/paste source by its fingerprint', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const existing = makePlaylistRecord({ id: 'old', type: 'm3u-file', contentFingerprint: 'fp1' });
            await storage.bulkPut('playlists', [existing], (r) => r.id);

            expect((await findExistingByFingerprint('fp1'))?.id).toBe('old');
            expect(await findExistingByFingerprint('fp2')).toBeUndefined();
        });
    });

    it('commitImport writes groups and the playlist record for a fresh (non-upsert) import', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const record = await commitImport(
                {
                    stagingId: 'new1',
                    type: 'm3u-url',
                    url: 'https://example.com/list.m3u',
                    name: 'My List',
                    summary: summary(),
                    etag: 'W/"abc"',
                    lastModified: null,
                    contentFingerprint: null,
                },
                undefined,
            );

            expect(record.id).toBe('new1');
            expect(record.channelCount).toBe(2);
            expect(record.groupCount).toBe(1);
            expect(record.etag).toBe('W/"abc"');

            const groups = await storage.getAll('groups');
            expect(groups).toEqual([{ playlistId: 'new1', name: 'News', channelCount: 2, firstIndex: 0 }]);
            const playlists = await storage.getAll('playlists');
            expect(playlists).toHaveLength(1);
        });
    });

    it('commitImport preserves importDate but refreshes lastRefresh on an upsert', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const existing = makePlaylistRecord({ id: 'old', importDate: 111, url: 'https://example.com/list.m3u' });
            await storage.bulkPut('playlists', [existing], (r) => r.id);

            const record = await commitImport(
                {
                    stagingId: 'new1',
                    type: 'm3u-url',
                    url: 'https://example.com/list.m3u',
                    name: 'My List',
                    summary: summary(),
                    etag: null,
                    lastModified: null,
                    contentFingerprint: null,
                },
                existing,
            );

            expect(record.importDate).toBe(111);
            expect(record.lastRefresh).toBeGreaterThan(0);
        });
    });

    it('commitImport deletes the superseded record and its rows on an upsert (write-then-swap)', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const existing = makePlaylistRecord({ id: 'old', url: 'https://example.com/list.m3u' });
            await storage.bulkPut('playlists', [existing], (r) => r.id);
            await storage.bulkPut('channels', [{ playlistId: 'old', index: 0, name: 'A', url: 'u', logo: null, group: null, tvgId: null, radio: false }], (r) => [r.playlistId, r.index]);
            await storage.bulkPut('groups', [{ playlistId: 'old', name: 'G', channelCount: 1, firstIndex: 0 }], (r) => [r.playlistId, r.name]);
            // Simulates what the real worker's chunk writes (Feature 06.4.6)
            // already landed under the new staging id *before* commitImport
            // runs — commitImport itself only writes `groups`/`playlists`.
            await storage.bulkPut('channels', [{ playlistId: 'new1', index: 0, name: 'B', url: 'u2', logo: null, group: null, tvgId: null, radio: false }], (r) => [r.playlistId, r.index]);

            await commitImport(
                {
                    stagingId: 'new1',
                    type: 'm3u-url',
                    url: 'https://example.com/list.m3u',
                    name: 'My List',
                    summary: summary(),
                    etag: null,
                    lastModified: null,
                    contentFingerprint: null,
                },
                existing,
            );

            const playlists = await storage.getAll('playlists');
            expect(playlists.map((p) => p.id)).toEqual(['new1']);
            const remainingChannels = await storage.getAll('channels');
            expect(remainingChannels.map((c) => c.playlistId)).toEqual(['new1']);
            const remainingGroups = await storage.getAll('groups');
            expect(remainingGroups.every((g) => g.playlistId === 'new1')).toBe(true);
        });
    });

    it('cleanupStaging deletes a staging import\'s rows without ever having written a playlist record', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('channels', [{ playlistId: 'staging1', index: 0, name: 'A', url: 'u', logo: null, group: null, tvgId: null, radio: false }], (r) => [r.playlistId, r.index]);
            await storage.bulkPut('groups', [{ playlistId: 'staging1', name: 'G', channelCount: 1, firstIndex: 0 }], (r) => [r.playlistId, r.name]);

            await cleanupStaging('staging1');

            expect(await storage.getAll('channels')).toHaveLength(0);
            expect(await storage.getAll('groups')).toHaveLength(0);
        });
    });
});
