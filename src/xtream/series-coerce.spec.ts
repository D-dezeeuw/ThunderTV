import { describe, expect, it } from 'vitest';
import { coerceSeriesInfo } from './series-coerce';

describe('xtream/series-coerce', () => {
    it('coerces the object-keyed-by-season shape into a sorted season map', () => {
        const result = coerceSeriesInfo({
            '1': [
                { id: 10, episode_num: 2, title: 'Ep 2' },
                { id: 9, episode_num: 1, title: 'Ep 1' },
            ],
            '2': [{ id: 20, episode_num: 1, title: 'S2E1' }],
        });
        expect(result).toEqual([
            {
                season: 1,
                episodes: [
                    { episodeId: 9, season: 1, episode: 1, title: 'Ep 1', containerExtension: 'mp4' },
                    { episodeId: 10, season: 1, episode: 2, title: 'Ep 2', containerExtension: 'mp4' },
                ],
            },
            { season: 2, episodes: [{ episodeId: 20, season: 2, episode: 1, title: 'S2E1', containerExtension: 'mp4' }] },
        ]);
    });

    it('coerces the array-of-arrays shape, mapping index 0 to season 1', () => {
        const result = coerceSeriesInfo([
            [{ id: '1', episode_num: 1, title: 'Pilot', container_extension: 'mkv' }],
            [{ id: '2', episode_num: 1, title: 'S2E1' }],
        ]);
        expect(result).toEqual([
            { season: 1, episodes: [{ episodeId: 1, season: 1, episode: 1, title: 'Pilot', containerExtension: 'mkv' }] },
            { season: 2, episodes: [{ episodeId: 2, season: 2, episode: 1, title: 'S2E1', containerExtension: 'mp4' }] },
        ]);
    });

    it('keeps seasons in ascending order across a gap (season 3 missing)', () => {
        const result = coerceSeriesInfo({
            '4': [{ id: 40, episode_num: 1, title: 'S4E1' }],
            '1': [{ id: 10, episode_num: 1, title: 'S1E1' }],
            '2': [{ id: 20, episode_num: 1, title: 'S2E1' }],
        });
        expect(result.map((s) => s.season)).toEqual([1, 2, 4]);
    });

    it('keeps a non-numeric episode id as a string instead of dropping the episode', () => {
        const result = coerceSeriesInfo({ '1': [{ id: 'abc-123', episode_num: 1, title: 'Weird id' }] });
        expect(result).toEqual([
            { season: 1, episodes: [{ episodeId: 'abc-123', season: 1, episode: 1, title: 'Weird id', containerExtension: 'mp4' }] },
        ]);
    });

    it('reads duration_secs from a nested info object when absent at the top level', () => {
        const result = coerceSeriesInfo({ '1': [{ id: 1, episode_num: 1, title: 'X', info: { duration_secs: '1500' } }] });
        expect(result[0]?.episodes[0]?.durationSecs).toBe(1500);
    });

    it('drops rows missing both episode_num and id, never throws', () => {
        expect(coerceSeriesInfo({ '1': [{ title: 'no id, no episode number' }] })).toEqual([]);
    });

    it('returns an empty array for null, undefined, and unusable payloads', () => {
        expect(coerceSeriesInfo(undefined)).toEqual([]);
        expect(coerceSeriesInfo(null)).toEqual([]);
        expect(coerceSeriesInfo('not an object')).toEqual([]);
        expect(coerceSeriesInfo({})).toEqual([]);
        expect(coerceSeriesInfo([])).toEqual([]);
    });
});
