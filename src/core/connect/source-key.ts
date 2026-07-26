import type { PlaylistType } from '../storage';

/**
 * Normalized source identity (masterplan §5.6, Feature 07.7.1) — the same
 * rule Phase 14's connect bookmarks and Phase 15's refresh depend on,
 * defined once here so both consume it byte-for-byte (Feature 07.7.10).
 *
 * `m3u-file`/`m3u-text` have no reliable identity to key on (no stable URL)
 * — `makeSourceKey` returns `null` for those, and callers fall back to the
 * content-fingerprint warning (Feature 07.7.6) instead of a silent dedupe.
 */
export function makeSourceKey(type: PlaylistType, url?: string, user?: string): string | null {
    if (type === 'm3u-file' || type === 'm3u-text') return null;
    if (!url) return null;
    const normalized = normalizeUrlKey(url);
    if (normalized === null) return null;
    return user ? `${type}:${normalized}:${user}` : `${type}:${normalized}`;
}

/**
 * Normalization rules (Feature 07.7.2): trim, lowercase scheme and host,
 * strip a trailing slash from the path, preserve path/query case (some
 * providers embed case-sensitive tokens there) and keep `http`/`https`
 * distinct (they are different endpoints, not interchangeable).
 */
export function normalizeUrlKey(rawUrl: string): string | null {
    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        return null;
    }

    const protocol = url.protocol.toLowerCase();
    const host = url.host.toLowerCase();
    const path = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;

    return `${protocol}//${host}${path}${url.search}`;
}
