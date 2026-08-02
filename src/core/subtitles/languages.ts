/**
 * ISO 639-2 → ISO 639-1, because OpenSubtitles is inconsistent about which
 * of the two 639-2 variants it uses and the app speaks two-letter codes
 * everywhere else (`settings.subtitleLanguage`, `<track srclang>`).
 *
 * A single search response for one film really does come back carrying
 * `cze` (639-2/B) next to `ron` and `ell` (639-2/T) next to `fre` (B again),
 * so a table keyed on one variant would drop whole languages depending on
 * which uploader filled the row in. Every alias therefore maps to the same
 * two-letter code, and `pob` — OpenSubtitles' own non-standard "Brazilian
 * Portuguese" — is folded into `pt` rather than dropped, since a viewer who
 * asked for Portuguese would rather have it than nothing.
 *
 * Deliberately not exhaustive: this covers the languages the settings picker
 * offers plus everything `state/subtitle-language.ts`'s country table can
 * resolve to, and anything unlisted passes through as its own raw code — an
 * unknown tag in a menu row is honest, an empty one is not.
 */
const ISO_639_2_TO_1: Readonly<Record<string, string>> = {
    eng: 'en',
    dut: 'nl',
    nld: 'nl',
    ger: 'de',
    deu: 'de',
    fre: 'fr',
    fra: 'fr',
    spa: 'es',
    ita: 'it',
    por: 'pt',
    pob: 'pt',
    pol: 'pl',
    tur: 'tr',
    gre: 'el',
    ell: 'el',
    rum: 'ro',
    ron: 'ro',
    swe: 'sv',
    nor: 'no',
    dan: 'da',
    fin: 'fi',
    rus: 'ru',
    ukr: 'uk',
    cze: 'cs',
    ces: 'cs',
    slo: 'sk',
    slk: 'sk',
    slv: 'sl',
    hrv: 'hr',
    srp: 'sr',
    bul: 'bg',
    hun: 'hu',
    heb: 'he',
    ara: 'ar',
    jpn: 'ja',
    kor: 'ko',
    chi: 'zh',
    zho: 'zh',
    hin: 'hi',
    ind: 'id',
    tha: 'th',
    vie: 'vi',
};

/**
 * `'eng'` → `'en'`, `'en'` → `'en'`, `'pt-BR'` → `'pt'`. Anything this table
 * doesn't know keeps its own lowercased code rather than becoming `''`.
 */
export function toIso6391(code: string): string {
    const raw = code.trim().toLowerCase();
    if (!raw) return '';
    const base = raw.split(/[-_]/)[0] ?? raw;
    if (base.length === 2) return base;
    return ISO_639_2_TO_1[base] ?? base;
}

/** Every three-letter code that resolves to `lang` — what a search filter has to match against, since one language reaches us under several spellings. */
export function iso6392Aliases(lang: string): string[] {
    const target = toIso6391(lang);
    return Object.keys(ISO_639_2_TO_1).filter((code) => ISO_639_2_TO_1[code] === target);
}
