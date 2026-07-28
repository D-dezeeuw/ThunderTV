/**
 * Canonical country/language table for the country-prefix tokens providers
 * actually put on channels and categories (`┃NL┃`, `DE`, `UK`, `USA`…), plus
 * the country/language names those tokens stand for. This is the shared
 * "NL/Nederland/Netherlands/Dutch are all the same thing" table that
 * `nl-priority.ts` (Xtream category sort) previously hard-coded only for
 * Dutch — see `matchesCountry()` below for the generalized version of that
 * regex — and that the upcoming first-run country/language wizard will read
 * from directly.
 *
 * `code` is the value already stored in `settings.liveCountry`
 * (`src/state/settings.ts`'s `LIVE_COUNTRIES`) and parsed by
 * `name-parse.ts`'s `COUNTRY_PREFIX` — never rename these, existing stored
 * settings and provider prefixes depend on them staying stable. `isoCode` is
 * only recorded where it differs from `code` (`UK` vs. ISO `GB`).
 *
 * Sourced by surveying every `┃XX┃`-style group prefix in
 * `.claude/context/thundertv-transformed-config-demo.xml` (43 distinct
 * tokens). Excluded from the table: `AR` (in that file it tags Arabic-
 * *language* bundles — "ISLAMIC", "BEIN SPORTS" — not Argentina, so treating
 * it as a country would be wrong more often than right), `EXYU` (a
 * multi-country "former Yugoslavia" bundle, not one country), and sports-
 * event tags (`PPV`, `UCL`, `WC`, `MOTOGP`, `MXGP`) that share the bracket
 * convention but aren't country prefixes at all.
 */

export interface CountryLanguageEntry {
    /** App-facing code — matches `settings.liveCountry` values and `parseChannelName()`/`parseCategoryName()` output. */
    code: string;
    /** ISO 3166-1 alpha-2, only set when it differs from `code`. */
    isoCode?: string;
    /** Country names/synonyms seen in the wild, English first. */
    countryNames: readonly string[];
    /** Primary ISO 639-1 language code. */
    languageCode: string;
    /** Language names/synonyms, English first. */
    languageNames: readonly string[];
    /** Extra prefix tokens real playlists use for this same country beyond `code` (e.g. `USA` for `US`, `CA EN`/`CA FR` for `CA`). */
    prefixAliases?: readonly string[];
}

export const COUNTRY_LANGUAGE_MAP: readonly CountryLanguageEntry[] = [
    { code: 'NL', countryNames: ['Netherlands', 'Nederland', 'Holland'], languageCode: 'nl', languageNames: ['Dutch', 'Nederlands'] },
    { code: 'BE', countryNames: ['Belgium', 'België', 'Belgique', 'Belgie'], languageCode: 'nl', languageNames: ['Dutch', 'Flemish', 'Nederlands', 'French', 'Français'] },
    { code: 'DE', countryNames: ['Germany', 'Deutschland'], languageCode: 'de', languageNames: ['German', 'Deutsch'] },
    { code: 'UK', isoCode: 'GB', countryNames: ['United Kingdom', 'Great Britain', 'Britain', 'England'], languageCode: 'en', languageNames: ['English'] },
    { code: 'FR', countryNames: ['France'], languageCode: 'fr', languageNames: ['French', 'Français'] },
    { code: 'ES', countryNames: ['Spain', 'España'], languageCode: 'es', languageNames: ['Spanish', 'Español'] },
    { code: 'US', countryNames: ['United States', 'America'], languageCode: 'en', languageNames: ['English'], prefixAliases: ['USA'] },
    { code: 'IT', countryNames: ['Italy', 'Italia'], languageCode: 'it', languageNames: ['Italian', 'Italiano'] },
    { code: 'PL', countryNames: ['Poland', 'Polska'], languageCode: 'pl', languageNames: ['Polish', 'Polski'] },
    { code: 'RO', countryNames: ['Romania', 'România'], languageCode: 'ro', languageNames: ['Romanian', 'Română'] },
    { code: 'AL', countryNames: ['Albania', 'Shqipëria'], languageCode: 'sq', languageNames: ['Albanian', 'Shqip'] },
    { code: 'GR', countryNames: ['Greece', 'Hellas', 'Ελλάδα'], languageCode: 'el', languageNames: ['Greek', 'Ελληνικά'] },
    { code: 'PT', countryNames: ['Portugal'], languageCode: 'pt', languageNames: ['Portuguese', 'Português'] },
    { code: 'CA', countryNames: ['Canada'], languageCode: 'en', languageNames: ['English', 'French', 'Français'], prefixAliases: ['CA EN', 'CA FR'] },
    { code: 'AU', countryNames: ['Australia'], languageCode: 'en', languageNames: ['English'] },
    { code: 'SE', countryNames: ['Sweden', 'Sverige'], languageCode: 'sv', languageNames: ['Swedish', 'Svenska'] },
    { code: 'IE', countryNames: ['Ireland', 'Éire'], languageCode: 'en', languageNames: ['English', 'Irish'] },
    { code: 'CZ', countryNames: ['Czech Republic', 'Czechia', 'Česko'], languageCode: 'cs', languageNames: ['Czech', 'Čeština'] },
    { code: 'BG', countryNames: ['Bulgaria', 'България'], languageCode: 'bg', languageNames: ['Bulgarian', 'Български'] },
    { code: 'CH', countryNames: ['Switzerland', 'Schweiz', 'Suisse'], languageCode: 'de', languageNames: ['German', 'French', 'Italian'] },
    { code: 'HU', countryNames: ['Hungary', 'Magyarország'], languageCode: 'hu', languageNames: ['Hungarian', 'Magyar'] },
    { code: 'RS', countryNames: ['Serbia', 'Srbija'], languageCode: 'sr', languageNames: ['Serbian', 'Srpski'] },
    { code: 'HR', countryNames: ['Croatia', 'Hrvatska'], languageCode: 'hr', languageNames: ['Croatian', 'Hrvatski'] },
    { code: 'FI', countryNames: ['Finland', 'Suomi'], languageCode: 'fi', languageNames: ['Finnish'] },
    { code: 'CY', countryNames: ['Cyprus', 'Κύπρος'], languageCode: 'el', languageNames: ['Greek'] },
    { code: 'DK', countryNames: ['Denmark', 'Danmark'], languageCode: 'da', languageNames: ['Danish', 'Dansk'] },
    { code: 'AT', countryNames: ['Austria', 'Österreich'], languageCode: 'de', languageNames: ['German', 'Deutsch'] },
    { code: 'NO', countryNames: ['Norway', 'Norge'], languageCode: 'no', languageNames: ['Norwegian', 'Norsk'] },
    { code: 'NZ', countryNames: ['New Zealand'], languageCode: 'en', languageNames: ['English'] },
    { code: 'SI', countryNames: ['Slovenia', 'Slovenija'], languageCode: 'sl', languageNames: ['Slovenian', 'Slovenščina'] },
    { code: 'LU', countryNames: ['Luxembourg', 'Lëtzebuerg'], languageCode: 'lb', languageNames: ['Luxembourgish', 'French', 'German'] },
    { code: 'ME', countryNames: ['Montenegro', 'Crna Gora'], languageCode: 'sr', languageNames: ['Montenegrin', 'Crnogorski'] },
    { code: 'BA', countryNames: ['Bosnia and Herzegovina', 'Bosnia', 'Bosna i Hercegovina'], languageCode: 'bs', languageNames: ['Bosnian', 'Bosanski'] },
    { code: 'MK', countryNames: ['North Macedonia', 'Macedonia', 'Makedonija'], languageCode: 'mk', languageNames: ['Macedonian', 'Македонски'] },
    { code: 'TR', countryNames: ['Turkey', 'Türkiye'], languageCode: 'tr', languageNames: ['Turkish', 'Türkçe'] },
    { code: 'SO', countryNames: ['Somalia'], languageCode: 'so', languageNames: ['Somali'], prefixAliases: ['SOM'] },
];

/** `code`/`prefixAliases` → entry, upper-cased key. Built once. */
const BY_TOKEN: ReadonlyMap<string, CountryLanguageEntry> = (() => {
    const map = new Map<string, CountryLanguageEntry>();
    for (const entry of COUNTRY_LANGUAGE_MAP) {
        map.set(entry.code.toUpperCase(), entry);
        for (const alias of entry.prefixAliases ?? []) map.set(alias.toUpperCase(), entry);
    }
    return map;
})();

/** Looks up an entry by its app code (`NL`) or a known raw playlist prefix token (`USA`, `CA EN`). */
export function findCountryByPrefix(token: string): CountryLanguageEntry | undefined {
    return BY_TOKEN.get(token.trim().toUpperCase());
}

/** Escapes a string for safe embedding inside a `RegExp` alternation. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary regex matching the code, every country name, and every
 * language name for one entry — the generalized form of `nl-priority.ts`'s
 * old hand-written `/\bnl\b|nederland|dutch|holland/i`. Built lazily per
 * code and cached, since callers typically test many names against the same
 * one or two countries (a category-list sort, a live filter).
 */
const PATTERN_CACHE = new Map<string, RegExp>();

function buildCountryPattern(entry: CountryLanguageEntry): RegExp {
    const cached = PATTERN_CACHE.get(entry.code);
    if (cached) return cached;
    const terms = [entry.code, ...entry.countryNames, ...entry.languageNames].map(escapeRegExp);
    const pattern = new RegExp(`\\b(?:${terms.join('|')})\\b`, 'iu');
    PATTERN_CACHE.set(entry.code, pattern);
    return pattern;
}

/**
 * True when `text` names the given country — by its code, a country-name
 * synonym, or a language-name synonym (`"NL | ENTERTAINMENT"`, `"Nederland"`,
 * `"Dutch Movies"` all match `NL`; `"DE | FILME"`, `"Deutschland"`, `"German
 * Movies"` all match `DE`). Unknown codes never match anything.
 */
export function matchesCountry(text: string, code: string): boolean {
    const entry = findCountryByPrefix(code);
    if (!entry) return false;
    return buildCountryPattern(entry).test(text);
}
