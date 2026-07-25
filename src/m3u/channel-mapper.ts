import { extractDrmFromRaw } from './kodiprop.utils';
import { getFilenameFromUrl } from './playlist.utils';
import type { PlaylistItem } from './parse-m3u';
import type { ChannelRow } from './types';

/**
 * Maps one parsed playlist item to a flat `ChannelRow` (Feature 06.5.4) —
 * the ThunderTV replacement for thunder-tv's nested `createPlaylistObject`
 * item-mapping step (Feature 06.5.2's decision: no wrapper `Playlist`
 * object here, just row-at-a-time mapping the worker calls per chunk).
 *
 * Returns `null` when the item has no stream URL (Feature 06.7.5) — the
 * caller (the worker, per-chunk) counts nulls into the parse summary's
 * `skipped` total; no row ever reaches storage or module memory without a
 * playable URL. `crypto.randomUUID()` replaces thunder-tv's `uuid` npm
 * dependency (Feature 06.1.3) — available in both browsers and module
 * workers, keeping ThunderTV's zero-extra-runtime-deps posture (Spektrum
 * aside).
 */
export function mapItemToChannelRow(item: PlaylistItem): ChannelRow | null {
    if (!item.url) {
        return null;
    }

    // Feature 06.7.4: a comma-less/name-less #EXTINF line yields an empty
    // parsed name (the parser's getName() finds no comma) — the filename
    // fallback matches thunder-tv's untitled-fallback spirit.
    const name = item.name.trim() || getFilenameFromUrl(item.url);
    const group = item.group.title.trim();
    const logo = item.tvg.logo.trim();
    const tvgId = item.tvg.id.trim();

    // Feature 06.8.2: raw is disposed after DRM extraction — it never
    // reaches the row (Feature 06.5.6/06.5.7's "parse once, read forever
    // without the bloat", and 06.8.8's raw-disposal-ordering contract).
    const drm = extractDrmFromRaw(item.raw);

    return {
        id: crypto.randomUUID(),
        name,
        url: item.url,
        group: group || null,
        logo: logo || null,
        tvgId: tvgId || null,
        radio: normalizeRadioFlag(item.radio),
        ...(drm ? { drm } : {}),
    };
}

/**
 * Normalizes the parser's raw `radio` string to a real boolean (Feature
 * 06.9.2) — `'true'`/`'True'`/unquoted `true` all become `true`; anything
 * else (including the parser's `''` default) is `false`. Deliberately
 * attribute-based only — no audio-extension URL heuristics (Feature
 * 06.9.3), to avoid false positives on video streams with odd URLs.
 */
function normalizeRadioFlag(value: string): boolean {
    return value.trim().toLowerCase() === 'true';
}
