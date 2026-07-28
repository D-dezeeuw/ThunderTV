/**
 * Which rows are radio stations.
 *
 * M3U carries an explicit `radio="true"` attribute, so the M3U pipeline
 * needs none of this. Xtream's `get_live_streams` carries nothing reliable
 * — panels signal radio through naming and grouping alone — and getting it
 * wrong is not cosmetic: a station that reads as TV lands in the Live list
 * (which has no player layout for it, and whose curated catalogue will
 * never know it), and the Radio view comes up empty.
 *
 * A single per-name keyword test is not enough in either direction:
 *
 *  - It misses. `SLAM!`, `QMUSIC`, `SUBLIME`, `JUKE HOUSE` and `WILD FM`
 *    are radio stations whose names say nothing of the sort, and a
 *    provider whose radio bundle is named for its genre rather than the
 *    medium leaves the whole bundle unclassified.
 *  - It over-fires. `RADIO BREMEN TV`, `ICI RADIO-CANADA TELE` and
 *    `RADIO ITALIA HD` are television channels with "radio" in the name.
 *
 * So classification happens at the group level, where providers actually
 * make the distinction. A group is a radio bundle when its name says so,
 * or when most of the names inside it look like stations; every row in
 * such a group is radio, whatever its own name says. Outside a radio
 * group, only an unambiguous per-name signal counts.
 */

/** Quality/format markers. Radio streams never carry them; a "RADIO …" channel that does is television. */
const VIDEO_MARKER = /\b(?:TV|TELE|TELEVISION|HD|FHD|UHD|SD|4K|8K|1080P?|720P?|HEVC|H\.?26[45])\b/i;

/** The medium named outright — the strongest single signal there is. */
const RADIO_WORD = /\bradio\b/i;

/**
 * The FM band as part of a station name: `WILD FM`, `URK FM`,
 * `SKY RADIO 101 FM`, and the run-on `NPO 3FM` (no word boundary between a
 * digit and the F, hence the `\d` alternative). Boundaries on both ends, so
 * `CONFIRM` never matches.
 *
 * AM is deliberately absent. It collides with far too much real catalogue
 * text to be worth the handful of stations it would add — event listings
 * are full of `11:00 AM ET`, and any name ending in a non-ASCII letter puts
 * a word boundary right before an `AM` that is part of the word
 * (`YEŞILÇAM`). Verified against the committed 20k-row dump, where AM
 * claimed dozens of television rows and no stations.
 */
const BAND_SUFFIX = /(?:\b|\d)FM\b/i;

/** Dutch/Flemish local-broadcaster vocabulary — these bundles are radio far more often than not, but never on their own without a group majority behind them. */
const STATION_HINT = /\b(?:omroep|omrop|zenders?|hitradio|nieuwsradio|webradio)\b/i;

/**
 * Words that identify a radio *bundle* rather than a station: a category
 * called this holds stations, whatever they are individually named. Shares
 * `BAND_SUFFIX`'s FM-only rule for the same reason — a bare `am` alternative
 * read the Turkish cinema bundle `┃TR┃ SINEMA YEŞILÇAM` as radio.
 */
const RADIO_GROUP_WORD = /\b(?:radios?|radiozenders|radiostations?|muziekzenders)\b|(?:\b|\d)FM\b/i;

/**
 * An individual name that is unmistakably a station. Deliberately strict:
 * this is what gets applied to rows *outside* a recognised radio group, so
 * a false positive here puts a TV channel in the Radio list.
 */
export function looksLikeRadioName(name: string): boolean {
    if (VIDEO_MARKER.test(name)) return false;
    return RADIO_WORD.test(name) || BAND_SUFFIX.test(name);
}

/** The looser test used only to decide whether a whole group is a radio bundle. */
function hintsAtRadio(name: string): boolean {
    if (VIDEO_MARKER.test(name)) return false;
    return RADIO_WORD.test(name) || BAND_SUFFIX.test(name) || STATION_HINT.test(name);
}

/** Below this a "majority" is noise — a three-channel group with two `… FM` names proves nothing. */
const MIN_GROUP_SIZE = 5;
/** Share of a group's names that must look like stations before the whole group counts as radio. */
const GROUP_SHARE = 0.6;

/**
 * True when this category is a radio bundle: either its own name says so,
 * or most of the names in it look like stations.
 */
export function isRadioGroup(groupName: string, channelNames: readonly string[]): boolean {
    if (RADIO_GROUP_WORD.test(groupName) && !VIDEO_MARKER.test(groupName)) return true;
    if (channelNames.length < MIN_GROUP_SIZE) return false;

    let hits = 0;
    for (const name of channelNames) if (hintsAtRadio(name)) hits += 1;
    return hits / channelNames.length >= GROUP_SHARE;
}

/**
 * The classifier the Xtream import uses: decide the group once, then apply
 * it to every row in it. Returns a predicate rather than a boolean so the
 * per-group work happens once for a bundle of thousands of channels.
 */
export function radioClassifierFor(groupName: string, channelNames: readonly string[]): (name: string) => boolean {
    if (isRadioGroup(groupName, channelNames)) return () => true;
    return looksLikeRadioName;
}
