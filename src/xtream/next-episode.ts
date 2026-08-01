import type { XtreamEpisode, XtreamSeriesInfo } from './types';

/**
 * Feature 21.6.3 — "what plays after this one", as a pure function.
 *
 * Deliberately free of state reads: the ended-handler that calls this is the
 * one place allowed to know *when* an episode finished, and keeping the
 * *which* answer pure is what makes the season-boundary and gap-season cases
 * testable without a player, a source, or a fetch.
 *
 * The rule is "next in this season, else the first episode of the next
 * season that has one, else null" — and every clause of that is load-bearing:
 *
 * - **Next in season is by position, not by number.** Providers skip episode
 *   numbers (specials, pulled episodes, plain data rot), so `episode + 1` is
 *   a lookup that fails on exactly the shows most likely to have gaps.
 *   `coerceSeriesInfo()` has already sorted each season by episode number, so
 *   the neighbour in the array is the right answer whatever the numbering.
 * - **"Next season" means the next one present**, not `season + 1` — gap
 *   seasons are explicitly a shape `coerceSeriesInfo()` tolerates, so a
 *   series with seasons 1, 2 and 4 must walk 2 → 4 rather than stopping at a
 *   season 3 that was never in the payload.
 * - **A current episode that is not in the map returns null.** That happens
 *   when a refresh drops an episode mid-playback; offering "next" from a
 *   position we can no longer locate would be a guess, and the series panel
 *   is a better place to land than a wrong episode.
 */
export function nextEpisode(
    seasons: XtreamSeriesInfo,
    current: { season: number; episode: number },
): XtreamEpisode | null {
    const seasonIndex = seasons.findIndex((s) => s.season === current.season);
    if (seasonIndex === -1) return null;

    const episodes = seasons[seasonIndex]?.episodes ?? [];
    const episodeIndex = episodes.findIndex((e) => e.episode === current.episode);
    if (episodeIndex === -1) return null;

    const nextInSeason = episodes[episodeIndex + 1];
    if (nextInSeason) return nextInSeason;

    // Season exhausted — walk forward for the next season that actually has
    // an episode. `coerceSeriesInfo()` drops empty seasons, so in practice
    // this finds the very next entry; the loop is here so a hand-built or
    // future season map with an empty bucket cannot end the series early.
    for (let i = seasonIndex + 1; i < seasons.length; i += 1) {
        const first = seasons[i]?.episodes[0];
        if (first) return first;
    }

    return null;
}
