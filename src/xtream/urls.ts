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

/** Strips a trailing slash and an accidentally pasted `/player_api.php` path (Feature 19.1.2). */
export function normalizeXtreamUrl(rawUrl: string): string {
    let url = rawUrl.trim();
    url = url.replace(/\/player_api\.php.*$/i, '');
    url = url.replace(/\/+$/, '');
    return url;
}

/** Masks user/pass in both path-style and query-style Xtream URLs — the only URL form permitted in logs or error messages (Feature 19.4.6). */
export function redactUrl(url: string): string {
    return url
        .replace(/([?&])(username|password)=[^&]*/gi, '$1$2=***')
        .replace(/\/live\/[^/]+\/[^/]+\//i, '/live/***/***/');
}
