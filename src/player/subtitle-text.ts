/**
 * SubRip → WebVTT, and the two labels a loaded file gets in the menu.
 *
 * `<track>` speaks WebVTT and nothing else, while everything shipped next to
 * a film on the internet is SubRip. The two formats are close enough that
 * the conversion is a header and a decimal comma — which is exactly why
 * doing it here, in twenty lines of pure string work, beats asking the
 * viewer to convert the file themselves.
 *
 * Pure and engine-free on purpose: `external-subs.ts` owns the `<track>`
 * element and the blob URL, this owns the text.
 */

/**
 * One timestamp, in every shape SubRip is written in the wild: `00:01:02,500`,
 * `0:01:02.5`, and the hour-less `01:02,500` some tools emit. Captured in
 * parts because WebVTT is strict where SubRip is not — see `normalizeTime()`.
 */
const SRT_TIMESTAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/g;
/** Both formats mark a cue with an arrow; text without one is not a subtitle file, whatever its extension says. */
const CUE_ARROW = '-->';
/** SubRip files exist with no spaces around the arrow, and with a stray tab; WebVTT's cue-timings parser requires exactly one space either side. */
const ARROW_SPACING = /[ \t]*-->[ \t]*/g;

/**
 * The file's text as WebVTT, or `null` when it carries no cues at all (a
 * mis-picked file, or a `.srt` that is really an archive) — the caller
 * reports that rather than attaching an empty track the viewer would have
 * to debug.
 *
 * Everything this does beyond "swap the comma for a dot" is there because a
 * browser drops a malformed cue *silently*: the track attaches, the menu
 * lists it, and no text ever appears. A file fetched from the internet
 * (`src/core/subtitles/`) gets no second pair of eyes before it reaches the
 * element, so the tolerant reading happens here — one-digit hours padded,
 * hour-less stamps given one, milliseconds padded to three, arrow spacing
 * normalized, and a leading BOM removed.
 */
export function toVtt(raw: string): string | null {
    // A BOM before the WEBVTT magic makes browsers reject the whole file.
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.includes(CUE_ARROW)) return null;
    const cues = text.replace(ARROW_SPACING, ' --> ').replace(SRT_TIMESTAMP, normalizeTime);
    return cues.startsWith('WEBVTT') ? cues : `WEBVTT\n\n${cues}`;
}

/**
 * `hh:mm:ss.mmm`, always. WebVTT wants two-or-more hour digits, two-digit
 * minutes/seconds and exactly three fractional ones; SubRip is written with
 * any of them short, and `0:00:01,5` is a whole cue a browser throws away
 * without saying so. Padding the fraction on the *right* matters — `,5` is
 * half a second, not five milliseconds.
 */
function normalizeTime(_match: string, hours: string | undefined, minutes: string, seconds: string, fraction: string): string {
    return `${(hours ?? '0').padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}.${fraction.padEnd(3, '0')}`;
}

/** How long a filename may be before the menu row starts wrapping — the tail is what differs between two subtitle files, so it is the end that is kept. */
const LABEL_MAX = 36;

/** `The.Film.2019.eng.srt` → `The.Film.2019.eng`, shortened from the front so the distinguishing tail survives. */
export function subtitleLabel(filename: string): string {
    const stem = filename.replace(/\.[^.]+$/, '').trim() || filename;
    return stem.length <= LABEL_MAX ? stem : `…${stem.slice(stem.length - LABEL_MAX)}`;
}

/**
 * The language tag from a `name.<lang>.srt` filename, which is how nearly
 * every subtitle download is named — `''` when the segment before the
 * extension isn't one, since a wrong `srclang` is worse than none (it drives
 * the viewer's `settings.subtitleLanguage` auto-pick).
 */
export function subtitleLang(filename: string): string {
    const parts = filename.replace(/\.[^.]+$/, '').split(/[.\-_]/);
    const tail = parts[parts.length - 1] ?? '';
    return /^[a-z]{2,3}$/i.test(tail) ? tail.toLowerCase() : '';
}
