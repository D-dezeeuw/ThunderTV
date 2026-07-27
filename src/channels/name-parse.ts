/**
 * IPTV channel-name parsing. Provider lists encode four things into one
 * string — country, channel, quality, and flags — with no agreed syntax:
 *
 *     | NL | NPO 1 HD           NL: NPO 1 FHD          [NL] RTL 4 SD
 *     NL - Ziggo Sport 4K       | NL | NPO 1 HD rec    NL| VTM ᴴᴰ
 *
 * Splitting those apart is what lets the UI show one "NPO 1" row with a
 * quality switcher instead of six near-identical rows. Everything here is
 * pure string work so the rules are directly testable — the corpus is
 * hostile and every provider invents its own punctuation.
 */

export type Quality = 'SD' | 'HD' | 'FHD' | 'UHD';

/** Best first — the order the variant switcher offers, and how the default variant is chosen. */
export const QUALITY_RANK: Record<Quality, number> = { UHD: 0, FHD: 1, HD: 2, SD: 3 };

export interface ParsedChannelName {
    /** Uppercase country/prefix token (`NL`, `BE`, `UK`…), or null when the name carries none. */
    country: string | null;
    /** The channel itself, punctuation and markers stripped: `NPO 1`. */
    base: string;
    /** Normalized comparison key for `base` — case/space/punctuation-insensitive. */
    key: string;
    quality: Quality | null;
    /** A catch-up/recording feed rather than the live channel (`rec`, `REC`, `(rec)`). */
    isRecording: boolean;
    /** Original string, untouched — always what we fall back to for display. */
    raw: string;
}

/**
 * Leading country/region marker in any of the shapes seen in the wild.
 * Deliberately anchored and length-bounded (2-3 letters): without that,
 * "NL" matching anywhere would maul names like "FINLAND" or "NL NIEUWS".
 */
const COUNTRY_PREFIX = /^\s*(?:\|\s*([A-Za-z]{2,3})\s*\||\[\s*([A-Za-z]{2,3})\s*\]|([A-Za-z]{2,3})\s*[:|–—-])\s*/;

/** Quality markers, longest/most specific first so `FHD` never matches as `HD`. */
const QUALITY_PATTERNS: ReadonlyArray<{ pattern: RegExp; quality: Quality }> = [
    { pattern: /\b(?:4K|UHD|2160P?)\b/i, quality: 'UHD' },
    { pattern: /\b(?:FHD|1080P?)\b/i, quality: 'FHD' },
    { pattern: /\b(?:HD|720P?)\b/i, quality: 'HD' },
    { pattern: /\b(?:SD|576P?|480P?)\b/i, quality: 'SD' },
];

/** Unicode superscript "ᴴᴰ" — several NL providers use it instead of plain "HD". */
const SUPERSCRIPT_HD = /ᴴᴰ/gi;

const RECORDING_MARKER = /[([]?\b(?:rec|recording|catchup|catch-?up|replay)\b[)\]]?/i;

/**
 * Noise that survives the quality/flag strip: codec and delivery hints no
 * viewer cares about, which would otherwise split one channel into several
 * groups (`NPO 1 H265` vs `NPO 1`).
 */
const TRAILING_NOISE = /\b(?:H\.?26[45]|HEVC|AVC|RAW|BACKUP|MULTI|ALT|OPT(?:ION)?\s*\d*|VIP|PLUS\+?)\b/gi;

/** Collapses a display name to a comparison key: case-folded, punctuation-free, single-spaced. */
export function normalizeKey(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

export function parseChannelName(raw: string): ParsedChannelName {
    let working = raw.replace(SUPERSCRIPT_HD, ' HD ');

    const countryMatch = COUNTRY_PREFIX.exec(working);
    const country = countryMatch ? (countryMatch[1] ?? countryMatch[2] ?? countryMatch[3] ?? '').toUpperCase() : null;
    if (countryMatch) working = working.slice(countryMatch[0].length);

    const isRecording = RECORDING_MARKER.test(working);
    if (isRecording) working = working.replace(RECORDING_MARKER, ' ');

    let quality: Quality | null = null;
    for (const { pattern, quality: q } of QUALITY_PATTERNS) {
        if (pattern.test(working)) {
            quality = q;
            working = working.replace(pattern, ' ');
            break;
        }
    }

    working = working.replace(TRAILING_NOISE, ' ');
    const base = working
        .replace(/[|[\]()]+/g, ' ')
        .replace(/\s*[-–—:]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Everything stripped (a name that was only markers) — keep the raw
    // string rather than emitting an empty row.
    const finalBase = base.length > 0 ? base : raw.trim();

    return { country, base: finalBase, key: normalizeKey(finalBase), quality, isRecording, raw };
}

/**
 * Category names carry the same country prefix (`| NL | ENTERTAINMENT`),
 * so the Dutch filter can work on categories before a single channel is
 * examined — the cheap first pass over a 90k-row catalog.
 */
export function parseCategoryName(raw: string): { country: string | null; label: string } {
    const match = COUNTRY_PREFIX.exec(raw);
    if (!match) return { country: null, label: raw.trim() };
    const country = (match[1] ?? match[2] ?? match[3] ?? '').toUpperCase();
    return { country, label: raw.slice(match[0].length).trim() || raw.trim() };
}
