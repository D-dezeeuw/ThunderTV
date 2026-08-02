/**
 * Xtream Codes types — MVP slice. Field names follow the masterplan §6.8 /
 * Phase 19 naming (`user`/`pass`, not `username`/`password`) internally;
 * `import.ts` maps to `PlaylistRecord`'s `username`/`password` fields at the
 * storage boundary.
 */
export interface XtreamSource {
    /** Base server URL, no trailing slash, no `/player_api.php` suffix. */
    url: string;
    user: string;
    pass: string;
}

export interface XtreamCategory {
    id: string;
    name: string;
}

export interface XtreamLiveStream {
    streamId: number;
    name: string;
    categoryId: string;
    icon?: string;
    epgChannelId?: string;
}

export interface AccountStatus {
    authenticated: boolean;
    status: string;
    expiresAt: number | null;
    /** From `user_info.allowed_output_formats` — empty when the provider omits it. Drives the live-URL extension pick at import (m3u8 preferred). */
    allowedOutputFormats: string[];
}

/** Phase 21 Feature 21.1/21.4 — a `get_vod_streams` row. Missing/null `category_id` coerces to the `'uncategorized'` bucket; missing/blank `container_extension` falls back to `'mp4'` (both at the normalize boundary in `client.ts`, never left for the UI to guess). */
export interface XtreamVodStream {
    streamId: number;
    name: string;
    categoryId: string;
    containerExtension: string;
    icon?: string;
    /** Provider sends this as either a string or a number — always coerced to a string here (`coerce.ts`'s `asString` handles both). */
    rating?: string;
    year?: string;
    /** Wire value is epoch *seconds* (`added`); converted to epoch *ms* here to match `AccountStatus.expiresAt`'s convention, so nothing downstream juggles two epoch units across this client's surface. */
    added?: number;
}

/** Phase 21 Feature 21.5 — a `get_series` row. Same `'uncategorized'` fallback rule as `XtreamVodStream`. */
export interface XtreamSeries {
    seriesId: number;
    name: string;
    categoryId: string;
    cover?: string;
    plot?: string;
    year?: string;
    rating?: string;
}

/** One episode from a `get_series_info` season bucket, after `series-coerce.ts` has normalized the season/episode numbering. */
export interface XtreamEpisode {
    /** Numeric when the wire id parses as a number (the common case); kept as the raw string otherwise rather than dropping the episode. */
    episodeId: number | string;
    season: number;
    episode: number;
    title: string;
    containerExtension: string;
    durationSecs?: number;
    /** From the episode's own `info.audio.codec_name`, same provenance and same caveats as `XtreamVodInfo`'s. */
    audioCodec?: string;
}

/** One season's episodes, already sorted by episode number — see `series-coerce.ts`. */
export interface XtreamSeriesSeason {
    season: number;
    episodes: XtreamEpisode[];
}

/** Ordered season map returned by `getSeriesInfo` — a sorted array (by `season`), never an object keyed by season number, regardless of which shape the provider sent on the wire. */
export type XtreamSeriesInfo = XtreamSeriesSeason[];

/** Phase 21 Feature 21.3 — `get_vod_info` detail fields the UI needs (provider data only, per the phase's "no TMDB, no extra requests" decision). */
export interface XtreamVodInfo {
    plot?: string;
    genre?: string;
    durationSecs?: number;
    releaseDate?: string;
    /**
     * The two external ids a TMDB-fed panel usually fills in. Nothing in the
     * catalog UI renders them — they exist for `src/core/subtitles/`, whose
     * whole identification ladder is "is there already a `tt…` for this
     * film". Kept even when only `tmdbId` is present: it is not resolvable
     * without an API key, but it is worth showing beside a fuzzy title match
     * (see `core/subtitles/identify.ts`).
     */
    imdbId?: string;
    tmdbId?: number;
    /**
     * What the panel's own ffprobe found in the file, from `info.video`/
     * `info.audio`'s `codec_name` — lower-cased, first token only (`ac3`,
     * `eac3`, `hevc`). Present only when the panel filled those blocks in,
     * which many do not, and wrong often enough that nothing may *act* on it:
     * `src/player/codec-support.ts` turns it into a warning shown before
     * play, and the playback path still decides by what actually happens.
     */
    videoCodec?: string;
    audioCodec?: string;
}
