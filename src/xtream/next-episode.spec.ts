import { describe, expect, it } from 'vitest';
import { nextEpisode } from './next-episode';
import type { XtreamSeriesInfo } from './types';

const ep = (season: number, episode: number) => ({
    episodeId: `s${String(season)}e${String(episode)}`,
    season,
    episode,
    title: `S${String(season)}E${String(episode)}`,
    containerExtension: 'mkv',
});

/** Seasons 1, 2 and 4 — a gap season, which `coerceSeriesInfo()` explicitly tolerates. Season 2 also skips episode 2, the numbering gap providers actually produce. */
const SEASONS: XtreamSeriesInfo = [
    { season: 1, episodes: [ep(1, 1), ep(1, 2)] },
    { season: 2, episodes: [ep(2, 1), ep(2, 3)] },
    { season: 4, episodes: [ep(4, 1)] },
];

describe('nextEpisode', () => {
    it('advances within a season', () => {
        expect(nextEpisode(SEASONS, { season: 1, episode: 1 })?.title).toBe('S1E2');
    });

    it('steps over a skipped episode number rather than looking up episode + 1', () => {
        // S2 runs 1, 3 — `episode + 1` would find nothing and end the series.
        expect(nextEpisode(SEASONS, { season: 2, episode: 1 })?.title).toBe('S2E3');
    });

    it('crosses a season boundary into the first episode of the next season', () => {
        expect(nextEpisode(SEASONS, { season: 1, episode: 2 })?.title).toBe('S2E1');
    });

    it('skips a gap season instead of stopping at the missing one', () => {
        // 2 -> 4, because season 3 was never in the payload.
        expect(nextEpisode(SEASONS, { season: 2, episode: 3 })?.title).toBe('S4E1');
    });

    it('returns null at the end of the series', () => {
        expect(nextEpisode(SEASONS, { season: 4, episode: 1 })).toBeNull();
    });

    it('returns null for a current episode no longer in the map', () => {
        // A refresh dropped the episode mid-playback: guessing a "next" from
        // a position we cannot locate would be worse than offering nothing.
        expect(nextEpisode(SEASONS, { season: 2, episode: 99 })).toBeNull();
        expect(nextEpisode(SEASONS, { season: 3, episode: 1 })).toBeNull();
    });

    it('does not treat an empty season as the end of the series', () => {
        const withEmpty: XtreamSeriesInfo = [
            { season: 1, episodes: [ep(1, 1)] },
            { season: 2, episodes: [] },
            { season: 3, episodes: [ep(3, 1)] },
        ];
        expect(nextEpisode(withEmpty, { season: 1, episode: 1 })?.title).toBe('S3E1');
    });

    it('returns null for an empty season map', () => {
        expect(nextEpisode([], { season: 1, episode: 1 })).toBeNull();
    });
});
