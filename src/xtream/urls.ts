import type { XtreamSource } from './types';

/**
 * The one module that owns every Xtream provider URL shape (masterplan
 * §6.8, Phase 19 Feature 19.4). Ported shapes from thunder-tv's
 * `xtream-url.service.ts`. Nothing else in the app string-concatenates a
 * provider URL — that is how credential-leaking log lines happen.
 */
export function apiUrl(source: XtreamSource, action: string, extra = ''): string {
    return `${source.url}/player_api.php?username=${encodeURIComponent(source.user)}&password=${encodeURIComponent(source.pass)}&action=${action}${extra}`;
}

export function liveStreamUrl(source: XtreamSource, streamId: number, ext = 'm3u8'): string {
    return `${source.url}/live/${encodeURIComponent(source.user)}/${encodeURIComponent(source.pass)}/${String(streamId)}.${ext}`;
}

/** The original Xtream live URL shape — no `/live/` prefix, no extension. Some panels serve ONLY this form (404ing `/live/...`), and many 302 it to their real HLS URL. */
export function legacyLiveStreamUrl(source: XtreamSource, streamId: number): string {
    return `${source.url}/${encodeURIComponent(source.user)}/${encodeURIComponent(source.pass)}/${String(streamId)}`;
}

/** Phase 21 Feature 21.4.1 — the movie stream URL shape (`{url}/movie/{user}/{pass}/{id}.{ext}`, masterplan §6.8). `containerExt` defaults to `'mp4'`, matching the client's normalize-boundary fallback for a missing/blank `container_extension`. */
export function vodStreamUrl(source: XtreamSource, streamId: number, containerExt = 'mp4'): string {
    return `${source.url}/movie/${encodeURIComponent(source.user)}/${encodeURIComponent(source.pass)}/${String(streamId)}.${containerExt}`;
}

/** Phase 21 Feature 21.6.1 — the series episode URL shape (`{url}/series/{user}/{pass}/{episodeId}.{ext}`). `episodeId` may be the raw string id `series-coerce.ts` kept when the wire value didn't parse as a number. */
export function seriesEpisodeUrl(source: XtreamSource, episodeId: number | string, containerExt = 'mp4'): string {
    return `${source.url}/series/${encodeURIComponent(source.user)}/${encodeURIComponent(source.pass)}/${String(episodeId)}.${containerExt}`;
}

/**
 * Strips a trailing slash and an accidentally pasted `/player_api.php` path
 * (Feature 19.1.2), and prepends `http://` when no scheme was typed —
 * `provider.example:8080` would otherwise parse as a URL whose *scheme* is
 * `provider.example`, making fetch throw an opaque TypeError that
 * classifies as a CORS/network failure instead of ever reaching the
 * provider.
 */
export function normalizeXtreamUrl(rawUrl: string): string {
    let url = rawUrl.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;
    url = url.replace(/\/player_api\.php.*$/i, '');
    url = url.replace(/\/+$/, '');
    return url;
}

/**
 * Masks user/pass in both path-style and query-style Xtream URLs — the only
 * URL form permitted in logs or error messages (Feature 19.4.6, extended by
 * 21.4.9 to the `/movie/` and `/series/` path shapes).
 *
 * Re-exported from `core/redact` rather than implemented here: this used to
 * be one of five separate redactors, and the parse-based one also catches
 * `user:pass@` userinfo and the `token`/`auth`/`key` parameters this
 * module's regex never knew about.
 */
export { redactUrl } from '../core/redact';
