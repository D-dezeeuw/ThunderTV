import { describe, expect, it } from 'vitest';
import type { XtreamSeriesInfo } from '../xtream/types';
import { buildSeriesDetailRows, seriesItemToRow, toSeriesDetail } from './series-rows';
import type { SeriesItem } from './series';

const item: SeriesItem = {
    seriesId: 7,
    name: '| WK | Show Title',
    categoryId: '1',
    cover: 'cover.jpg',
    plot: 'A plot.',
    year: '2020',
    rating: '8.0',
    searchKey: 'show title',
};

describe('buildSeriesDetailRows()', () => {
    it('flattens seasons/episodes into one ordered array, season header before its own episodes', () => {
        const info: XtreamSeriesInfo = [
            {
                season: 1,
                episodes: [
                    { episodeId: 100, season: 1, episode: 1, title: 'Pilot', containerExtension: 'mp4', durationSecs: 125 },
                    { episodeId: 101, season: 1, episode: 2, title: 'Episode 2', containerExtension: 'mp4' },
                ],
            },
            {
                season: 2,
                episodes: [{ episodeId: 200, season: 2, episode: 1, title: 'S2E1', containerExtension: 'mp4', durationSecs: 90 }],
            },
        ];

        expect(buildSeriesDetailRows(info, 500)).toEqual([
            { kind: 'season', season: 1 },
            { kind: 'episode', episodeId: 100, season: 1, episode: 1, title: 'Pilot', durationMins: 2, containerExtension: 'mp4' },
            { kind: 'episode', episodeId: 101, season: 1, episode: 2, title: 'Episode 2', durationMins: null, containerExtension: 'mp4' },
            { kind: 'season', season: 2 },
            { kind: 'episode', episodeId: 200, season: 2, episode: 1, title: 'S2E1', durationMins: 2, containerExtension: 'mp4' },
        ]);
    });

    it('rounds durationMins, never leaving Math.* work for the template', () => {
        const info: XtreamSeriesInfo = [
            {
                season: 1,
                episodes: [
                    { episodeId: 1, season: 1, episode: 1, title: 'A', containerExtension: 'mp4', durationSecs: 89 }, // 1.483.. -> 1
                    { episodeId: 2, season: 1, episode: 2, title: 'B', containerExtension: 'mp4', durationSecs: 90 }, // 1.5 -> 2
                ],
            },
        ];

        expect(buildSeriesDetailRows(info, 500)).toEqual([
            { kind: 'season', season: 1 },
            { kind: 'episode', episodeId: 1, season: 1, episode: 1, title: 'A', durationMins: 1, containerExtension: 'mp4' },
            { kind: 'episode', episodeId: 2, season: 1, episode: 2, title: 'B', durationMins: 2, containerExtension: 'mp4' },
        ]);
    });

    it('preserves order across a gap in season numbering (season 2 absent) without inventing a placeholder', () => {
        const info: XtreamSeriesInfo = [
            { season: 1, episodes: [{ episodeId: 1, season: 1, episode: 1, title: 'A', containerExtension: 'mp4' }] },
            { season: 3, episodes: [{ episodeId: 2, season: 3, episode: 1, title: 'B', containerExtension: 'mp4' }] },
        ];

        expect(buildSeriesDetailRows(info, 500).map((r) => (r.kind === 'season' ? `season:${String(r.season)}` : `ep:${r.title}`))).toEqual([
            'season:1',
            'ep:A',
            'season:3',
            'ep:B',
        ]);
    });

    it('stops adding further seasons once the episode cap is exhausted mid-season', () => {
        const info: XtreamSeriesInfo = [
            {
                season: 1,
                episodes: [
                    { episodeId: 1, season: 1, episode: 1, title: 'A', containerExtension: 'mp4' },
                    { episodeId: 2, season: 1, episode: 2, title: 'B', containerExtension: 'mp4' },
                ],
            },
            { season: 2, episodes: [{ episodeId: 3, season: 2, episode: 1, title: 'C', containerExtension: 'mp4' }] },
        ];

        expect(buildSeriesDetailRows(info, 1)).toEqual([
            { kind: 'season', season: 1 },
            { kind: 'episode', episodeId: 1, season: 1, episode: 1, title: 'A', durationMins: null, containerExtension: 'mp4' },
        ]);
    });

    it('returns an empty array for a series with no seasons', () => {
        expect(buildSeriesDetailRows([], 500)).toEqual([]);
    });
});

describe('series-rows name cleaning (Issue 1 wiring)', () => {
    it('seriesItemToRow() strips a leading provider decoration tag from the row name', () => {
        expect(seriesItemToRow(item, null).name).toBe('Show Title');
    });

    it('toSeriesDetail() strips a leading provider decoration tag from the detail name', () => {
        expect(toSeriesDetail(item, null).name).toBe('Show Title');
    });
});
