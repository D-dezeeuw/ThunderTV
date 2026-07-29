import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { PROGRAM_MAX_AGE_MS, pruneStalePrograms } from './prune';

describe('pruneStalePrograms', () => {
    it('deletes only programs whose stop has aged past maxAgeMs', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const now = Date.now();
            await storage.bulkPut(
                'epgPrograms',
                [
                    { channelId: 'a', start: now - PROGRAM_MAX_AGE_MS - 2000, stop: now - PROGRAM_MAX_AGE_MS - 1000, title: 'Stale', description: null },
                    { channelId: 'a', start: now, stop: now + 3600_000, title: 'Fresh', description: null },
                ],
                (r) => [r.channelId, r.start],
            );

            const pruned = await pruneStalePrograms(PROGRAM_MAX_AGE_MS);

            expect(pruned).toBe(1);
            const remaining = await storage.getAll('epgPrograms');
            expect(remaining.map((p) => p.title)).toEqual(['Fresh']);
        });
    });

    it('is a no-op when nothing is stale', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const now = Date.now();
            await storage.bulkPut(
                'epgPrograms',
                [{ channelId: 'a', start: now, stop: now + 3600_000, title: 'Fresh', description: null }],
                (r) => [r.channelId, r.start],
            );

            expect(await pruneStalePrograms(PROGRAM_MAX_AGE_MS)).toBe(0);
            expect(await storage.getAll('epgPrograms')).toHaveLength(1);
        });
    });

    it('resolves 0 against an empty table', async () => {
        await withFakePlatform({}, async () => {
            expect(await pruneStalePrograms(PROGRAM_MAX_AGE_MS)).toBe(0);
        });
    });
});
