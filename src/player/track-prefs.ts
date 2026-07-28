import type { MediaTrack } from './tracks';

/**
 * Pure track-selection policy — no engine imports, nothing DOM/Spektrum. A
 * later state/UI stage calls these with the viewer's saved language
 * preference and whatever `getPlayerTracks()` (`engine.ts`) currently
 * reports; this module never touches an engine directly.
 */

/** ISO 639-1/639-2(-B/-T)/common-name aliases → canonical 2-letter code. Deliberately not exhaustive — see `normalizeLangCode`'s heuristic fallback for anything else short enough to look like a code. */
const LANG_ALIASES: Readonly<Record<string, string>> = {
    en: 'en',
    eng: 'en',
    english: 'en',
    nl: 'nl',
    dut: 'nl',
    nld: 'nl',
    dutch: 'nl',
    nederlands: 'nl',
    flemish: 'nl',
    de: 'de',
    ger: 'de',
    deu: 'de',
    german: 'de',
    fr: 'fr',
    fre: 'fr',
    fra: 'fr',
    french: 'fr',
    es: 'es',
    spa: 'es',
    spanish: 'es',
    it: 'it',
    ita: 'it',
    italian: 'it',
    pt: 'pt',
    por: 'pt',
    portuguese: 'pt',
    tr: 'tr',
    tur: 'tr',
    turkish: 'tr',
    ar: 'ar',
    ara: 'ar',
    arabic: 'ar',
    pl: 'pl',
    pol: 'pl',
    polish: 'pl',
    ro: 'ro',
    ron: 'ro',
    rum: 'ro',
    romanian: 'ro',
    gr: 'el',
    el: 'el',
    ell: 'el',
    gre: 'el',
    greek: 'el',
    ru: 'ru',
    rus: 'ru',
    russian: 'ru',
    sv: 'sv',
    swe: 'sv',
    swedish: 'sv',
    no: 'no',
    nor: 'no',
    norwegian: 'no',
    da: 'da',
    dan: 'da',
    danish: 'da',
    fi: 'fi',
    fin: 'fi',
    finnish: 'fi',
};

/** A bare 1-3 letter code we don't recognize is still worth a best-effort guess; anything longer and unrecognized is just noise, not a language code. */
const LOOKS_LIKE_LANG_CODE = /^[a-z]{1,3}$/;

/**
 * Maps a raw language string (ISO 639-1, 639-2, or an English/native name,
 * in whatever case the source used) to a canonical 2-letter code for
 * comparison. Unknown input falls back to its own lowercased first two
 * letters only when it's short enough to plausibly *be* a language code;
 * anything else normalizes to `''` rather than guessing.
 */
export function normalizeLangCode(raw: string): string {
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned) return '';
    const known = LANG_ALIASES[cleaned];
    if (known) return known;
    if (LOOKS_LIKE_LANG_CODE.test(cleaned)) return cleaned.slice(0, 2);
    return '';
}

/**
 * First track matching `preferredLang`, else the first English track (the
 * global fallback), else `undefined` — leave whatever the engine already
 * selected alone rather than guessing further.
 */
export function pickDefaultAudioTrack(tracks: readonly MediaTrack[], preferredLang: string): MediaTrack | undefined {
    const preferred = normalizeLangCode(preferredLang);
    if (preferred) {
        const match = tracks.find((track) => normalizeLangCode(track.lang) === preferred);
        if (match) return match;
    }
    return tracks.find((track) => normalizeLangCode(track.lang) === 'en');
}

/**
 * `'off'` (or a preference that doesn't match anything available) means
 * subtitles stay off — `null`. Otherwise the first track matching
 * `preferredLang`, or `null` if none does; there is no further fallback
 * language for subtitles the way there is for audio.
 *
 * `preferredLang` is typed as plain `string` rather than `string | 'off'`:
 * the literal union collapses to `string` for type-checking purposes (every
 * `'off'` is already a `string`), which `@typescript-eslint/no-redundant-
 * type-constituents` flags as an error — `'off'` is documented here as the
 * sentinel value instead of encoded in the signature.
 */
export function pickDefaultSubtitleTrack(tracks: readonly MediaTrack[], preferredLang: string): MediaTrack | null {
    if (preferredLang === 'off') return null;
    const preferred = normalizeLangCode(preferredLang);
    if (!preferred) return null;
    return tracks.find((track) => normalizeLangCode(track.lang) === preferred) ?? null;
}
