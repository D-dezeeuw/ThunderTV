import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { allHealthRecords, clearHealth, healthForUrl, isUrlLikelyDead, observe, primeHealthCache, resetHealthCacheForTests, scoreForUrl } from './store';

const URL_A = 'http://p.example/live/bob/hunter2/1.ts';
const URL_B = 'http://p.example/live/bob/hunter2/2.ts';

afterEach(() => {
    resetHealthCacheForTests();
});

describe('the health store', () => {
    it('records a success and reads it back by URL', async () => {
        await withFakePlatform({}, () => {
            observe(URL_A, 'ok', 700);
            expect(scoreForUrl(URL_A, Date.now())).toBe(1);
            expect(healthForUrl(URL_A)?.ttffMs).toBe(700);
        });
    });

    it('never stores the credentials that were in the URL', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            observe(URL_A, 'ok', 500);
            // Let the fire-and-forget write land.
            await Promise.resolve();
            const rows = await storage.getAll('streamHealth');
            const serialized = JSON.stringify(rows);
            expect(serialized).not.toContain('bob');
            expect(serialized).not.toContain('hunter2');
        });
    });

    it('keeps two feeds on the same panel separate', async () => {
        await withFakePlatform({}, () => {
            observe(URL_A, 'ok', 300);
            observe(URL_B, 'failed');
            expect(scoreForUrl(URL_A, Date.now())).toBe(1);
            expect(scoreForUrl(URL_B, Date.now())).toBe(0);
        });
    });

    it('reports no score and no verdict for a URL it has never seen', async () => {
        await withFakePlatform({}, () => {
            expect(scoreForUrl('http://unseen.example/live/u/p/9.ts', Date.now())).toBeNull();
            expect(isUrlLikelyDead('http://unseen.example/live/u/p/9.ts', Date.now())).toBe(false);
        });
    });

    it('ignores a null/blank URL and an unparseable one rather than throwing', async () => {
        await withFakePlatform({}, () => {
            observe(null, 'ok');
            observe('', 'failed');
            observe('not a url', 'failed');
            expect(allHealthRecords()).toHaveLength(0);
        });
    });

    it('marks a repeatedly-failing feed as likely dead', async () => {
        await withFakePlatform({}, () => {
            observe(URL_A, 'failed');
            observe(URL_A, 'failed');
            observe(URL_A, 'failed');
            expect(isUrlLikelyDead(URL_A, Date.now())).toBe(true);
        });
    });

    it('restores the cache from storage on prime, so a reboot keeps what was learned', async () => {
        await withFakePlatform({}, async () => {
            observe(URL_A, 'ok', 400);
            await Promise.resolve();

            resetHealthCacheForTests();
            expect(scoreForUrl(URL_A, Date.now())).toBeNull();

            await primeHealthCache();
            expect(scoreForUrl(URL_A, Date.now())).toBe(1);
        });
    });

    it('clearHealth empties both the cache and the table', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            observe(URL_A, 'ok', 400);
            await Promise.resolve();

            await clearHealth();
            expect(allHealthRecords()).toHaveLength(0);
            expect(await storage.getAll('streamHealth')).toHaveLength(0);
        });
    });

    it('a storage failure never propagates — health is an optimisation, not a correctness requirement', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            storage.bulkPut = () => Promise.reject(new Error('quota'));
            expect(() => {
                observe(URL_A, 'ok', 100);
            }).not.toThrow();
            // The in-memory answer is still correct for this session.
            expect(scoreForUrl(URL_A, Date.now())).toBe(1);
            await Promise.resolve();
        });
    });
});
