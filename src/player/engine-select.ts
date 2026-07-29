import { SETTINGS_PLAYBACK_ENGINE, type PlaybackEngine } from '../state/settings';
import { get } from '../state/typed';
import { alternateFormatUrl } from './stream-probe';

/**
 * Which engine gets a given URL, and in what shape — the decision half of
 * `engine.ts`, split out because that file sits on ESLint's 400-line hard
 * ceiling (the same "own file, one import back" precedent
 * `src/app/strings.en.player.ts` and `src/state/registry-overflow.ts`
 * already set). Nothing here touches the `<video>` element or any module
 * state, which is what makes it directly testable.
 *
 * Three real formats show up in IPTV:
 *
 *  - raw MPEG-TS    → mpegts.js (`mpegts-engine.ts`). The DEFAULT: most
 *    Xtream panels serve an endless transport stream whose `.m3u8` is only
 *    a wrapper, which hls.js rejects outright (`levelParsingError`) and no
 *    browser decodes natively. mpegts.js demuxes it to MSE.
 *  - segmented HLS  → hls.js, or the browser's own native HLS on
 *    Safari/iOS, which refuses a second decoder for a format it ships.
 *  - a plain file   → the browser's own pipeline, and ONLY that
 *    (`isProgressiveFile()`). VOD is `movie/…/1234.mkv`: a static file, not
 *    a stream. Neither demuxer can read one, and letting them try is not
 *    free — mpegts.js pulls a whole stash (up to 4 MB) before its format
 *    probe can fail, and hls.js reads the *entire* body as text looking for
 *    `#EXTM3U`, which on a multi-GB film is the "it downloads the movie
 *    instead of playing it" that made every VOD title spin forever.
 *  - anything else  → hand the URL to the browser and let its pipeline try.
 *
 * `settings.playbackEngine` picks which is tried FIRST; the others follow
 * as fallbacks, so a wrong preference costs one retry rather than
 * playback. Each attempt uses the URL form its engine expects — the
 * `.ts`/`.m3u8` sibling of what the catalog baked (`alternateFormatUrl`),
 * since Xtream serves the same channel under both.
 */

/**
 * Container extensions that mean "a file served over HTTP", which only the
 * browser's own pipeline can play — and plays *incrementally*, fetching
 * ahead of the playhead and seeking with `Range` requests. That is the
 * bit-by-bit streaming a movie needs, and it is exactly what the two
 * demuxer engines take away by getting the URL first.
 *
 * `.avi` is here despite no browser decoding it: failing at the element in
 * a second, with a message, beats hls.js quietly pulling the file down for
 * twenty.
 */
const PROGRESSIVE_FILE_EXTENSIONS = ['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi'];

/**
 * Matches on the URL tail, which works on the proxied form too: the
 * template embeds an `encodeURIComponent`-ed target, and that leaves dots
 * and letters intact — the same property `alternateFormatUrl()` relies on
 * (see `stream-probe.ts`). A `?`-query is stripped first; panels append
 * session tokens to VOD URLs.
 */
export function isProgressiveFile(url: string): boolean {
    const tail = url.split('?')[0]?.toLowerCase() ?? '';
    return PROGRESSIVE_FILE_EXTENSIONS.some((ext) => tail.endsWith(ext));
}

export function preferredEngine(): PlaybackEngine {
    const configured = get<PlaybackEngine | null>(SETTINGS_PLAYBACK_ENGINE);
    return configured ?? 'mpegts';
}

/**
 * Preference first, then the remaining engines as fallbacks — every stream
 * gets all three before giving up. A progressive file is the exception: the
 * preference cannot apply, because mpegts.js and hls.js cannot read one at
 * any cost, and the cost is a doomed multi-megabyte download each.
 */
export function attemptChain(preference: PlaybackEngine, url: string): PlaybackEngine[] {
    if (isProgressiveFile(url)) return ['native'];
    const rest = (['mpegts', 'hls', 'native'] as PlaybackEngine[]).filter((e) => e !== preference);
    return [preference, ...rest];
}

/** The `.ts` form of a stream URL — Xtream serves the same channel under both extensions. */
export function tsFormOf(url: string): string {
    if (url.endsWith('.ts')) return url;
    const alt = alternateFormatUrl(url);
    return alt?.label === '.ts' ? alt.url : url;
}

/** The `.m3u8` form of a stream URL. */
export function hlsFormOf(url: string): string {
    if (url.endsWith('.m3u8')) return url;
    const alt = alternateFormatUrl(url);
    return alt?.label === '.m3u8' ? alt.url : url;
}
