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
 *
 * Providers bracket the token with whatever glyph they like — `| NL |`,
 * `[NL]`, and real lists using box-drawing characters such as `┃NL┃` or
 * `▐NL▌`. Rather than enumerate them, the first alternative accepts *any*
 * run of non-letter, non-digit, non-space characters as the bracket. That
 * generality is safe only because a bracket is required on both sides:
 * matching a bare `NL ` would also swallow the `TV` of `TV 538`.
 *
 * The second alternative covers the unbracketed `NL:` / `NL - ` forms,
 * where the trailing separator is the only evidence. Both are anchored and
 * length-bounded to 2-3 letters, so `FINLAND NEWS` is never read as a
 * country followed by `LAND NEWS`.
 */
const COUNTRY_PREFIX =
    /^\s*(?:[^\p{L}\p{N}\s]+\s*([A-Za-z]{2,3})\s*[^\p{L}\p{N}\s]+|()([A-Za-z]{2,3})\s*[:–—-])\s*/u;

/** Quality markers, longest/most specific first so `FHD` never matches as `HD`. */
const QUALITY_PATTERNS: ReadonlyArray<{ pattern: RegExp; quality: Quality }> = [
    // `8K` is marketing rather than a real transport format on these lists,
    // but it is unambiguously the top tier, so it groups with UHD.
    { pattern: /\b(?:8K|4K|UHD|2160P?)\b/i, quality: 'UHD' },
    { pattern: /\b(?:FHD|1080P?)\b/i, quality: 'FHD' },
    { pattern: /\b(?:HD|720P?)\b/i, quality: 'HD' },
    { pattern: /\b(?:SD|576P?|480P?)\b/i, quality: 'SD' },
];

/** Unicode superscript "ᴴᴰ" — several NL providers use it instead of plain "HD". */
const SUPERSCRIPT_HD = /ᴴᴰ/gi;

/**
 * Superscript letters, which providers use for flags the same way they use
 * plain ones — `⏺ʳᵉᶜ` is a catch-up feed. Folded to ASCII before any flag
 * matching so one set of rules covers both spellings.
 */
const SUPERSCRIPT_LETTERS: Record<string, string> = {
    'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f', 'ᵍ': 'g',
    'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm', 'ⁿ': 'n',
    'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v',
    'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
};

const SUPERSCRIPT_LETTER_PATTERN = new RegExp(`[${Object.keys(SUPERSCRIPT_LETTERS).join('')}]`, 'gu');

/** Record/replay pictographs providers pair with a `rec` marker (`⏺ʳᵉᶜ`), and which would otherwise survive into the display name. */
const RECORDING_GLYPHS = /[⏺⏵⏯⏪⏩●◉🔴]/gu;

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
    let working = raw
        .replace(SUPERSCRIPT_HD, ' HD ')
        .replace(SUPERSCRIPT_LETTER_PATTERN, (ch) => SUPERSCRIPT_LETTERS[ch] ?? ch);

    // A record pictograph is itself a catch-up marker on lists that use it
    // without the word, so it counts before being stripped as decoration.
    const hasRecordGlyph = RECORDING_GLYPHS.test(working);
    RECORDING_GLYPHS.lastIndex = 0;
    working = working.replace(RECORDING_GLYPHS, ' ');

    const countryMatch = COUNTRY_PREFIX.exec(working);
    const country = countryMatch ? (countryMatch[1] ?? countryMatch[3] ?? '').toUpperCase() : null;
    if (countryMatch) working = working.slice(countryMatch[0].length);

    const hasRecordWord = RECORDING_MARKER.test(working);
    if (hasRecordWord) working = working.replace(RECORDING_MARKER, ' ');
    const isRecording = hasRecordWord || hasRecordGlyph;

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
        // Any bracketing/decoration glyph, not just ASCII: providers pad
        // names with box-drawing and separator characters that would
        // otherwise end up in the display name and in the grouping key.
        .replace(/[^\p{L}\p{N}\s+&'./-]+/gu, ' ')
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
    const country = (match[1] ?? match[3] ?? '').toUpperCase();
    return { country, label: raw.slice(match[0].length).trim() || raw.trim() };
}
