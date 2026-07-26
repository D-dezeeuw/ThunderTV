import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { sweepOrphanedPlaylistRows } from './import-sweep';

const channelRow = (playlistId: string, index: number) => ({
    playlistId,
    index,
    name: 'A',
    url: 'u',
    logo: null,
    group: null,
    tvgId: null,
    radio: false,
});
const groupRow = (playlistId: string) => ({ playlistId, name: 'G', channelCount: 1, firstIndex: 0 });

describe('sweepOrphanedPlaylistRows (Feature 07.9.7)', () => {
    afterEach(() => {
        resetPlatformForTests();
    });

    it('deletes channel/group rows whose playlistId matches no playlists record', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('channels', [channelRow('orphaned', 0)], (r) => [r.playlistId, r.index]);
            await storage.bulkPut('groups', [groupRow('orphaned')], (r) => [r.playlistId, r.name]);

            const result = await sweepOrphanedPlaylistRows();

            expect(result).toEqual({ channels: 1, groups: 1 });
            expect(await storage.count('channels')).toBe(0);
            expect(await storage.count('groups')).toBe(0);
        });
    });

    it('leaves rows belonging to a real playlist record untouched', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('playlists', [makePlaylistRecord({ id: 'real' })], (r) => r.id);
            await storage.bulkPut('channels', [channelRow('real', 0), channelRow('orphaned', 0)], (r) => [r.playlistId, r.index]);

            const result = await sweepOrphanedPlaylistRows();

            expect(result.channels).toBe(1);
            const remaining = await storage.getAll('channels');
            expect(remaining.map((r) => r.playlistId)).toEqual(['real']);
        });
    });

    it('is a no-op when there is nothing orphaned', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('playlists', [makePlaylistRecord({ id: 'real' })], (r) => r.id);
            await storage.bulkPut('channels', [channelRow('real', 0)], (r) => [r.playlistId, r.index]);

            expect(await sweepOrphanedPlaylistRows()).toEqual({ channels: 0, groups: 0 });
            expect(await storage.count('channels')).toBe(1);
        });
    });
});
