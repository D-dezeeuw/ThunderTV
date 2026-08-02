import { asArray, asNumber, asString, codecName } from './coerce';
import type { XtreamEpisode, XtreamSeriesInfo, XtreamSeriesSeason } from './types';

/**
 * Real `get_series_info` providers send the `episodes` field in either of
 * two shapes — an object keyed by season number (`{"1": [...], "2": [...]}`,
 * the common shape) or an array of per-season arrays (index 0 → season 1) —
 * plus gap seasons (e.g. 1, 2, 4 with no 3) and string-typed episode ids.
 * This is the one place that tolerates all of it and always hands back a
 * sorted `season → episodes` array; a payload with no usable episodes
 * returns `[]` rather than throwing (Feature 21.5.4/21.5.9).
 */
export function coerceSeriesInfo(episodesRaw: unknown): XtreamSeriesInfo {
    const bySeason = groupBySeason(episodesRaw);

    const seasons: XtreamSeriesSeason[] = [];
    for (const [season, rowsRaw] of bySeason) {
        const rows = asArray<Record<string, unknown>>(rowsRaw);
        const episodes = rows
            .map((row) => normalizeEpisode(row, season))
            .filter((e): e is XtreamEpisode => e !== undefined)
            .sort((a, b) => a.episode - b.episode);
        if (episodes.length > 0) seasons.push({ season, episodes });
    }

    return seasons.sort((a, b) => a.season - b.season);
}

/** Splits the raw `episodes` field into `[seasonNumber, rawEpisodeRows]` pairs, independent of whether the wire shape is object-keyed or an array. */
function groupBySeason(episodesRaw: unknown): Array<[number, unknown]> {
    if (Array.isArray(episodesRaw)) {
        return episodesRaw.map((rows, index): [number, unknown] => [index + 1, rows]);
    }
    if (episodesRaw && typeof episodesRaw === 'object') {
        const pairs: Array<[number, unknown]> = [];
        for (const [key, value] of Object.entries(episodesRaw as Record<string, unknown>)) {
            const season = asNumber(key);
            if (season !== undefined) pairs.push([season, value]);
        }
        return pairs;
    }
    return [];
}

/** The outer season key/index is authoritative for `season` — dirty rows may omit or mismatch their own `season` field, but the bucket they were fetched under is never ambiguous. */
function normalizeEpisode(row: Record<string, unknown>, season: number): XtreamEpisode | undefined {
    const episodeNum = asNumber(row['episode_num']) ?? asNumber(row['episode']);
    if (episodeNum === undefined) return undefined;

    const episodeId = asNumber(row['id']) ?? asString(row['id']);
    if (episodeId === undefined) return undefined;

    const containerExtension = asString(row['container_extension'])?.trim() || 'mp4';
    const title = asString(row['title']) ?? '';
    const durationSecs = asNumber(row['duration_secs']) ?? asNumber(infoField(row)['duration_secs']);
    // Same ffprobe block a movie carries, one level further in. Worth taking
    // because an episode's soundtrack is the one thing a viewer cannot find
    // out without watching it (`src/player/codec-support.ts`).
    const audioCodec = codecName(infoField(row)['audio']);

    return {
        episodeId,
        season,
        episode: episodeNum,
        title,
        containerExtension,
        ...(durationSecs !== undefined ? { durationSecs } : {}),
        ...(audioCodec !== undefined ? { audioCodec } : {}),
    };
}

function infoField(row: Record<string, unknown>): Record<string, unknown> {
    const info = row['info'];
    return info && typeof info === 'object' ? (info as Record<string, unknown>) : {};
}
