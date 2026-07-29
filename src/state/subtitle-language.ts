/**
 * Pure `settings.subtitleLanguage` resolution (Phase 21) — `'auto'` defers
 * to the user's `settings.liveCountry`, mapped through this small table;
 * `'off'` and an explicit language code pass straight through. Deliberately
 * does not decide *when* to apply a subtitle track — the player layer reads
 * this value at use time, matching `settings.ts`'s `SETTINGS_SUBTITLE_LANGUAGE`
 * doc ("'auto' means derive from settings.liveCountry at use time").
 */
const COUNTRY_TO_LANGUAGE: Readonly<Record<string, string>> = {
    NL: 'nl',
    DE: 'de',
    FR: 'fr',
    BE: 'nl',
    UK: 'en',
    US: 'en',
    IE: 'en',
    ES: 'es',
    IT: 'it',
    PL: 'pl',
    PT: 'pt',
    TR: 'tr',
    GR: 'el',
    RO: 'ro',
    SE: 'sv',
    NO: 'no',
    DK: 'da',
    FI: 'fi',
};

const DEFAULT_LANGUAGE = 'en';

/**
 * `setting` is `settings.subtitleLanguage`'s raw stored value; `liveCountry`
 * is `settings.liveCountry`. Returns `'off'` verbatim, an explicit
 * already-chosen language code verbatim, or (for `'auto'`) the mapped
 * language for `liveCountry` — unknown/empty countries resolve to `'en'`.
 */
export function resolveSubtitleLanguage(setting: string, liveCountry: string): string {
    if (setting === 'off') return 'off';
    if (setting !== 'auto') return setting;
    return COUNTRY_TO_LANGUAGE[liveCountry.trim().toUpperCase()] ?? DEFAULT_LANGUAGE;
}
