import { describe, expect, it } from 'vitest';
import type { PlaylistRecord } from '../core/storage';
import {
    collectSweepSources,
    createSweepAccumulator,
    planIsWarm,
    SWEEP_PROGRESS_ZERO,
    sweepPrefix,
    withDerivedProgress,
    type SweepSource,
} from './sweep-plan';

/**
 * The parts of "search all" that are easy to get wrong and cheap to check
 * directly: which sources the sweep visits and in what order, how the
 * cross-provider union deduplicates, and whether the progress readout tells
 * the truth about partial coverage. The fetch loop itself is covered by
 * `catalog-sweep.spec.ts`.
 */

function record(over: Partial<PlaylistRecord> = {}): PlaylistRecord {
    return {
        v: 1,
        id: 'p1',
        type: 'xtream',
        name: 'Provider One',
        url: 'http://one.example',
        username: 'alice',
        password: 'secret',
        channelCount: 0,
        groupCount: 0,
        radioCount: 0,
        drmCount: 0,
        skipped: 0,
        importDate: 0,
        lastRefresh: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        ...over,
    } as PlaylistRecord;
}

function source(over: Partial<SweepSource> = {}): SweepSource {
    return {
        sourceId: 'p1',
        sourceKey: 'xtream:http://one.example:alice',
        name: 'Provider One',
        active: false,
        source: { url: 'http://one.example', user: 'alice', pass: 'secret' },
        ...over,
    };
}

describe('collectSweepSources()', () => {
    it('keeps only fully-credentialed Xtream records, active source first', () => {
        const sources = collectSweepSources(
            [
                record({ id: 'm3u', type: 'm3u-url', name: 'Playlist' }),
                record({ id: 'p2', url: 'http://two.example', username: 'bob', name: 'Two' }),
                record({ id: 'nopass', url: 'http://three.example', username: 'carol', password: '' }),
                record({ id: 'p1', name: 'One' }),
            ],
            'p1',
        );

        expect(sources.map((s) => s.sourceId)).toEqual(['p1', 'p2']);
        expect(sources[0]?.active).toBe(true);
        expect(sources[1]?.active).toBe(false);
    });

    it('dedups two records that resolve to the same source key (a re-import mints a new id)', () => {
        const sources = collectSweepSources(
            [record({ id: 'old' }), record({ id: 'new', url: 'HTTP://ONE.example/' })],
            'new',
        );
        expect(sources).toHaveLength(1);
        // First writer wins, so the *stored order* decides which row's id is
        // carried — the key is what identifies the provider either way.
        expect(sources[0]?.sourceId).toBe('old');
    });
});

describe('sweepPrefix()', () => {
    it('gives the active source the bare prefix, so it shares the existing warm cache', () => {
        expect(sweepPrefix('vod', source({ active: true }))).toBe('vod');
    });

    it('namespaces every other source by its stable source key', () => {
        expect(sweepPrefix('series', source())).toBe('series@xtream:http://one.example:alice');
    });
});

describe('planIsWarm()', () => {
    const now = 1_000_000_000;
    const ttl = 24 * 60 * 60 * 1000;

    it('is true only when every source is inside the TTL', () => {
        expect(planIsWarm([now - 1000, now - 2000], now, ttl)).toBe(true);
        expect(planIsWarm([now - 1000, now - ttl - 1], now, ttl)).toBe(false);
        expect(planIsWarm([now - 1000, null], now, ttl)).toBe(false);
    });

    it('is false for an empty plan — no coverage is not full coverage', () => {
        expect(planIsWarm([], now, ttl)).toBe(false);
    });
});

describe('createSweepAccumulator()', () => {
    const one = source({ sourceKey: 'one', name: 'One', active: true });
    const two = source({ sourceKey: 'two', sourceId: 'p2', name: 'Two' });
    const idOf = (item: { id: number }): number => item.id;

    it('keeps the first source that claims an id and reports the collision', () => {
        const acc = createSweepAccumulator(idOf);
        expect(acc.add(one, [{ id: 1 }, { id: 2 }])).toBe(0);
        expect(acc.add(two, [{ id: 2 }, { id: 3 }])).toBe(1);

        expect(acc.items().map(idOf)).toEqual([1, 2, 3]);
        expect(acc.duplicates()).toBe(1);
        // The active source added first, so a collision never re-points an
        // id the rest of the app already resolves through the active memory.
        expect(acc.ownerOf(2)).toBe(one);
        expect(acc.ownerOf(3)).toBe(two);
        expect(acc.ownerOf(99)).toBeUndefined();
    });

    it('counts only providers that actually contributed, which is what decides row labelling', () => {
        const acc = createSweepAccumulator(idOf);
        acc.add(one, [{ id: 1 }]);
        expect(acc.sourceCount()).toBe(1);
        acc.add(two, []); // reachable but empty — not a second provider in the results
        expect(acc.sourceCount()).toBe(1);
        acc.add(two, [{ id: 5 }]);
        expect(acc.sourceCount()).toBe(2);
    });

    it('reset() drops the union, the owner index and the counters', () => {
        const acc = createSweepAccumulator(idOf);
        acc.add(one, [{ id: 1 }]);
        acc.reset();
        expect(acc.items()).toEqual([]);
        expect(acc.ownerOf(1)).toBeUndefined();
        expect(acc.duplicates()).toBe(0);
        expect(acc.sourceCount()).toBe(0);
    });
});

describe('withDerivedProgress()', () => {
    const base = { ...SWEEP_PROGRESS_ZERO, sourcesTotal: 4 };

    it('counts a failed source as done, so the bar completes and "partial" carries the honesty', () => {
        const progress = withDerivedProgress({ ...base, sourcesDone: 4, sourcesFailed: 1 }, false);
        expect(progress.percent).toBe(100);
        expect(progress.partial).toBe(true);
    });

    it('is partial while sources are still outstanding, and after a cancel', () => {
        expect(withDerivedProgress({ ...base, sourcesDone: 2 }, false).partial).toBe(true);
        expect(withDerivedProgress({ ...base, sourcesDone: 2 }, false).percent).toBe(50);
        expect(withDerivedProgress({ ...base, sourcesDone: 4 }, true).partial).toBe(true);
    });

    it('is complete only when every source finished and none failed', () => {
        const progress = withDerivedProgress({ ...base, sourcesDone: 4 }, false);
        expect(progress.partial).toBe(false);
        expect(progress.percent).toBe(100);
    });

    it('never divides by zero on an empty plan', () => {
        expect(withDerivedProgress(SWEEP_PROGRESS_ZERO, false).percent).toBe(0);
    });
});
