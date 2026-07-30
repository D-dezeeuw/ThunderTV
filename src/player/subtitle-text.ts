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

/** `00:01:02,500 --> 00:01:04,000` — SubRip's comma decimal separator is the only timestamp difference that matters. */
const SRT_TIMESTAMP = /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g;
/** Both formats mark a cue with an arrow; text without one is not a subtitle file, whatever its extension says. */
const CUE_ARROW = '-->';

/**
 * The file's text as WebVTT, or `null` when it carries no cues at all (a
 * mis-picked file, or a `.srt` that is really an archive) — the caller
 * reports that rather than attaching an empty track the viewer would have
 * to debug.
 */
export function toVtt(raw: string): string | null {
    // A BOM before the WEBVTT magic makes browsers reject the whole file.
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.includes(CUE_ARROW)) return null;
    const cues = text.replace(SRT_TIMESTAMP, '$1.$2');
    return cues.startsWith('WEBVTT') ? cues : `WEBVTT\n\n${cues}`;
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
