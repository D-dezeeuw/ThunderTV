/**
 * Ported from thunder-tv's `playlist.utils.ts` (Feature 06.1.2), split into
 * its own file per Feature 06.1.9's line-budget split and trimmed per
 * Feature 06.1.8's decision:
 *
 * **Kept**: `extractM3uEpgUrls` — the `x-tvg-url`/`url-tvg`/`tvg-url` header
 * attribute extraction Phase 16's EPG ingestion needs.
 *
 * **Dropped**: `selectRecommendedEpgUrls` and the region-hint scoring
 * machinery it depends on (`collectPlaylistEpgRegionHints`,
 * `extractEpgGuideCodes`, language/country code tables) — that logic scores
 * detected URLs against inferred playlist language/country hints to build
 * an *enabled* subset when there are many candidates. It is a Settings/UX
 * concern for whichever phase builds the EPG source picker, not something
 * the parsing engine itself needs to produce. `extractM3uEpgUrls` alone
 * (the raw detection) is what this phase's own text names as required.
 */

/** The one shape this module needs from a parsed playlist header — decoupled from any specific parser package's output type. */
export interface PlaylistHeaderLike {
    attrs: Record<string, string | undefined>;
    raw: string;
}

const M3U_EPG_HEADER_ATTRS = ['x-tvg-url', 'url-tvg', 'tvg-url'] as const;
const M3U_EPG_URL_PATTERN = /\b(?:https?|file):\/\/[^\s,"']+/gi;

export function extractM3uEpgUrls(header: PlaylistHeaderLike | null | undefined): string[] {
    if (!header) {
        return [];
    }

    const candidates: Array<string | undefined> = [];
    for (const attr of M3U_EPG_HEADER_ATTRS) {
        candidates.push(header.attrs[attr]);
        candidates.push(extractHeaderAttributeFromRaw(header.raw, attr));
    }

    const urls: string[] = [];
    for (const candidate of candidates) {
        urls.push(...extractUrlsFromHeaderValue(candidate));
    }

    return Array.from(new Set(urls));
}

function extractHeaderAttributeFromRaw(raw: string | undefined, attr: string): string | undefined {
    if (!raw) {
        return undefined;
    }

    const match = raw.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s]+))`, 'i'));

    return match?.[2] ?? match?.[3] ?? match?.[4];
}

function extractUrlsFromHeaderValue(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    const urls: string[] = [];
    const pattern = new RegExp(M3U_EPG_URL_PATTERN);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(value)) !== null) {
        const url = match[0].trim();
        if (url.length > 0) {
            urls.push(url);
        }
    }

    return urls;
}
