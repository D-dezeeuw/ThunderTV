import { parse, type Playlist } from 'iptv-playlist-parser';

export type { Playlist, PlaylistHeader, PlaylistItem } from 'iptv-playlist-parser';

/**
 * The one wrapper around the patched `iptv-playlist-parser` fork (Feature
 * 06.2.2) — the fork's `parse()` is imported here and nowhere else in the
 * codebase (enforced by the `no-restricted-imports` fence in
 * `eslint.config.js`, Feature 06.2.10).
 *
 * **Why the fork, not upstream** (Feature 06.2.9): pinned to
 * `github:4gray/iptv-playlist-parser#v0.15.2-iptvnator.2` — the same tag
 * IPTVnator/thunder-tv ships — which adds the `radio` attribute and
 * pipe-stripped stream URLs (`item.url` cut at the first `|`, with
 * `|User-Agent=`/`|Referer=` params still landing in `item.http`) over
 * plain upstream v0.15.2. Bump both this comment and the `package.json`
 * dependency together if the pin ever changes.
 *
 * The fork already strips a leading UTF-8 BOM and tolerates blank lines
 * before a case-insensitive `#EXTM3U` header internally (verified by
 * reading its source and confirmed by the regression fixture in
 * `malformed.spec.ts`) — this wrapper does not duplicate that.
 *
 * Never throws (Feature 06.7.2's contract): the fork throws only when no
 * `#EXTM3U` header can be found at all, which really does mean "zero
 * channels salvageable" — that single throw path is caught here and
 * reported as `{ ok: false }` instead of propagating.
 */
export type ParseM3uResult = { ok: true; playlist: Playlist } | { ok: false; reason: 'no-header' };

export function parseM3u(text: string): ParseM3uResult {
    try {
        return { ok: true, playlist: parse(text) };
    } catch {
        return { ok: false, reason: 'no-header' };
    }
}
