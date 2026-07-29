import { describe, expect, it } from 'vitest';
import {
    compareForPlayback,
    decayFactor,
    emptyRecord,
    HALF_LIFE_MS,
    healthScore,
    isLikelyDead,
    recordFailure,
    recordSuccess,
    type HealthRecord,
} from './score';

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 60 * 60 * 1000;

function seed(): HealthRecord {
    return emptyRecord('k', T0);
}

describe('decayFactor', () => {
    it('is 1 at zero age and 0.5 at exactly one half-life', () => {
        expect(decayFactor(0)).toBe(1);
        expect(decayFactor(HALF_LIFE_MS)).toBeCloseTo(0.5, 10);
    });

    it('drops to zero well past the useful horizon rather than trailing forever', () => {
        expect(decayFactor(100 * HALF_LIFE_MS)).toBe(0);
    });
});

describe('healthScore', () => {
    it('is null with no evidence — "never tried" must not rank as "always fails"', () => {
        expect(healthScore(seed(), T0)).toBeNull();
    });

    it('is 1 after a success and 0 after a lone failure', () => {
        expect(healthScore(recordSuccess(seed(), T0, 500), T0)).toBe(1);
        expect(healthScore(recordFailure(seed(), T0), T0)).toBe(0);
    });

    it('lets recent evidence outweigh older contrary evidence', () => {
        // Twenty failures a month ago, two successes today: this feed works.
        let record = seed();
        const monthAgo = T0 - 30 * DAY;
        record = { ...record, updatedAt: monthAgo };
        for (let i = 0; i < 20; i++) record = recordFailure(record, monthAgo);
        record = recordSuccess(record, T0, 400);
        record = recordSuccess(record, T0, 400);

        expect(healthScore(record, T0)).toBeGreaterThan(0.5);
        expect(isLikelyDead(record, T0)).toBe(false);
    });

    it('marks a feed dead only once failures genuinely dominate recent evidence', () => {
        let record = seed();
        record = recordSuccess(record, T0, 300);
        record = recordFailure(record, T0);
        // One-for-one is not a verdict.
        expect(isLikelyDead(record, T0)).toBe(false);

        record = recordFailure(record, T0);
        record = recordFailure(record, T0);
        expect(isLikelyDead(record, T0)).toBe(true);
    });

    it('never marks an untried feed dead', () => {
        expect(isLikelyDead(seed(), T0)).toBe(false);
    });
});

describe('time to first frame', () => {
    it('takes the first sample as-is, then smooths later ones', () => {
        const first = recordSuccess(seed(), T0, 1000);
        expect(first.ttffMs).toBe(1000);

        const second = recordSuccess(first, T0, 2000);
        // Smoothed, so one unusually slow start does not rewrite the estimate.
        expect(second.ttffMs).toBeGreaterThan(1000);
        expect(second.ttffMs).toBeLessThan(2000);
    });

    it('ignores a missing or negative sample instead of corrupting the estimate', () => {
        const withTtff = recordSuccess(seed(), T0, 800);
        expect(recordSuccess(withTtff, T0, null).ttffMs).toBe(800);
        expect(recordSuccess(withTtff, T0, -5).ttffMs).toBe(800);
    });
});

describe('compareForPlayback', () => {
    const good = recordSuccess(recordSuccess(emptyRecord('good', T0), T0, 300), T0, 300);
    const bad = recordFailure(recordFailure(emptyRecord('bad', T0), T0), T0);

    it('puts a known-good feed ahead of a known-bad one', () => {
        expect(compareForPlayback(good, bad, T0)).toBeLessThan(0);
        expect(compareForPlayback(bad, good, T0)).toBeGreaterThan(0);
    });

    it('sorts an untried feed between known-good and known-bad', () => {
        expect(compareForPlayback(good, null, T0)).toBeLessThan(0);
        expect(compareForPlayback(null, bad, T0)).toBeLessThan(0);
    });

    it('breaks a reliability tie by which feed starts faster', () => {
        const fast = recordSuccess(emptyRecord('fast', T0), T0, 200);
        const slow = recordSuccess(emptyRecord('slow', T0), T0, 4000);
        expect(compareForPlayback(fast, slow, T0)).toBeLessThan(0);
    });

    it('sorts a whole variant list best-first', () => {
        const sorted = [bad, null, good].sort((a, b) => compareForPlayback(a, b, T0));
        expect(sorted).toEqual([good, null, bad]);
    });
});
