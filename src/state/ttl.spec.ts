import { describe, expect, it } from 'vitest';
import { CATALOG_TTL_MS, isFresh } from './ttl';

describe('isFresh()', () => {
    it('is false when fetchedAt is null (never fetched)', () => {
        expect(isFresh(null, 1_000, CATALOG_TTL_MS)).toBe(false);
    });

    it('is true just inside the TTL window', () => {
        const now = 1_000_000;
        expect(isFresh(now - CATALOG_TTL_MS + 1, now, CATALOG_TTL_MS)).toBe(true);
    });

    it('is false exactly at and past the TTL boundary', () => {
        const now = 1_000_000;
        expect(isFresh(now - CATALOG_TTL_MS, now, CATALOG_TTL_MS)).toBe(false);
        expect(isFresh(now - CATALOG_TTL_MS - 1, now, CATALOG_TTL_MS)).toBe(false);
    });

    it('tracks a mocked clock advancing past the TTL', () => {
        let now = 0;
        const fetchedAt = now;

        now += CATALOG_TTL_MS - 1;
        expect(isFresh(fetchedAt, now, CATALOG_TTL_MS)).toBe(true);

        now += 2;
        expect(isFresh(fetchedAt, now, CATALOG_TTL_MS)).toBe(false);
    });

    it('a shorter custom ttlMs goes stale sooner than the catalog default', () => {
        const now = 10_000;
        expect(isFresh(now - 5_000, now, 4_000)).toBe(false);
        expect(isFresh(now - 5_000, now, 6_000)).toBe(true);
    });
});
