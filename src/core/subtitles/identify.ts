/**
 * Turning "what is playing" into an IMDb id — the hard half of fetching
 * subtitles for an Xtream title, and entirely pure so it can be tested
 * without a network.
 *
 * Every keyless subtitle source worth having is addressed by IMDb id (the
 * Stremio addon protocol's `idPrefixes: ["tt"]`), while an Xtream panel hands
 * us a display name, sometimes a year, and — on TMDB-fed panels — a
 * `tmdb_id`. There is no keyless TMDB → IMDb converter, so the ladder is:
 *
 *   1. a real `tt…` id in the provider's own metadata (free, exact);
 *   2. title + year searched against a keyless catalog, ranked here;
 *   3. nothing — reported as "couldn't identify this title", never guessed.
 *
 * `tmdbId` is carried through and *shown*, not resolved: it is what lets the
 * caller's result header say which film it matched, so a wrong rung-2 match
 * is visible rather than silently wrong.
 */

/** What the caller knows about the title on screen. `title` should already be display-cleaned (`state/catalog-clean-name.ts`) — this layer never sees provider decoration tags. */
export interface TitleHints {
    title: string;
    /** Provider `year`/`releasedate`, in whatever shape it arrived; `parseYear()` does the coercion. */
    year?: string | number | null;
    imdbId?: string | null;
    tmdbId?: number | null;
}

/** One row of a keyless catalog search, already parsed off the wire (`providers.ts`). */
export interface TitleCandidate {
    imdbId: string;
    name: string;
    year: number | null;
}

/** A ranked candidate plus why it ranked there — `confident` is what decides whether the UI presents the match as a fact or as a guess. */
export interface RankedTitle {
    candidate: TitleCandidate;
    score: number;
    confident: boolean;
}

/** `tt0111161` and nothing else. Providers put all sorts of things in an `imdb_id` field (`0111161`, `""`, `0`, a TMDB number), and a malformed id sent to the subtitle service is a silent empty result. */
export function asImdbId(value: unknown): string | null {
    if (typeof value === 'number') return null;
    if (typeof value !== 'string') return null;
    const raw = value.trim().toLowerCase();
    return /^tt\d{5,10}$/.test(raw) ? raw : null;
}

/** First four-digit year in the value — handles `2019`, `"2019"`, `"2019-04-26"` and `"26.04.2019"` alike, which is the full spread `get_vod_info` actually ships. */
export function parseYear(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const match = /\b(19|20)\d{2}\b/.exec(String(value));
    return match ? Number(match[0]) : null;
}

/** Release/quality noise a panel bakes into a title; stripped before comparison so `Dune 2021 1080p` and `Dune` are the same query. */
const RELEASE_NOISE =
    /\b(?:\d{3,4}p|4k|uhd|hd(?:rip)?|sd|web-?dl|web-?rip|bluray|bdrip|dvdrip|hdtv|x26[45]|h\.?26[45]|hevc|aac|dts|ac3|remux|multi|dual|imax|extended|unrated|director'?s? cut)\b/g;

/**
 * The comparison form of a title: no diacritics, no bracketed asides, no
 * release noise, no punctuation, no leading article. Both sides of every
 * match go through it, so it only has to be *consistent*, not linguistically
 * correct.
 */
export function normalizeTitle(raw: string): string {
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
        .replace(RELEASE_NOISE, ' ')
        .replace(/\b(19|20)\d{2}\b/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/^(?:the|a|an) /, '')
        .trim()
        .replace(/\s+/g, ' ');
}

/** Below this a candidate shares no meaningful title overlap with the query and is dropped rather than offered — a subtitle for the wrong film is worse than none. */
const SCORE_FLOOR = 40;

/**
 * Candidates best-first, hopeless ones dropped. `candidates` arrives in the
 * catalog's own popularity order, which is a real signal, so ties break
 * toward the earlier entry.
 *
 * The score is deliberately coarse — exact title beats prefix beats
 * containment, and a matching year is worth more than any of them can make
 * up on their own, because "same words, wrong decade" is the single most
 * common way a remake steals a match.
 */
export function rankTitleCandidates(candidates: readonly TitleCandidate[], hints: TitleHints): RankedTitle[] {
    const query = normalizeTitle(hints.title);
    if (!query) return [];
    const wantedYear = parseYear(hints.year);

    return candidates
        .map((candidate, index) => {
            const name = normalizeTitle(candidate.name);
            let score = 0;
            if (name === query) score = 100;
            else if (name.startsWith(query) || query.startsWith(name)) score = 60;
            else if (name.includes(query) || query.includes(name)) score = 45;

            const yearMatch = wantedYear !== null && candidate.year !== null && Math.abs(candidate.year - wantedYear) <= 1;
            if (yearMatch) score += 30;
            else if (wantedYear !== null && candidate.year !== null) score -= 15;

            score -= Math.min(index, 9);
            return { candidate, score, confident: name === query && (wantedYear === null || yearMatch) };
        })
        .filter((ranked) => ranked.score >= SCORE_FLOOR)
        .sort((a, b) => b.score - a.score);
}

/**
 * The Stremio content id a subtitle lookup is addressed by: a bare `tt…` for
 * a film, `tt…:season:episode` for one episode. Episode numbers are the
 * provider's own (`XtreamEpisode.season`/`.episode`), which `series-coerce.ts`
 * has already normalized to real numbers.
 */
export function contentIdFor(imdbId: string, episode?: { season: number; episode: number } | null): string {
    if (!episode) return imdbId;
    return `${imdbId}:${String(episode.season)}:${String(episode.episode)}`;
}
