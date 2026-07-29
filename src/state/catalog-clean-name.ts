/**
 * Strips leading provider decoration tags from Movies/Series catalog display
 * names. Real Xtream lists put a pipe- or bracket-delimited short code on
 * EVERY category/title (`| NL | WK 2026`, `|NL| NPO 1`, `┃NL┃ Something`,
 * `[HD] Show`) — genuinely useful for grouping/searching once, but pure
 * repeated noise once every chip/row in a Movies/Series list carries the
 * same tag.
 *
 * Deliberately a new, small, pure module rather than an extension of
 * `src/channels/name-parse.ts`: that module's `COUNTRY_PREFIX` strips only
 * ONE leading tag and folds it into a country/quality/recording-flag parse
 * that feeds Live/Radio's grouping and variant-switcher logic — behavior
 * Issue 1 must leave untouched (Live/Radio/Categories keep their own
 * pipeline). `cleanCatalogDisplayName()` instead strips a *repeated* run of
 * short tags and does nothing else — no quality/country extraction, no
 * grouping key — so it's safe to call purely at the Movies/Series
 * state-publication boundary without any risk of touching Live/Radio.
 *
 * Call sites (all "publish a display name", never stored/searched data):
 * `vod-rows.ts`'s `vodItemToRow()`/`toVodDetail()`, `series-rows.ts`'s
 * `seriesItemToRow()`/`toSeriesDetail()`, and `vod.actions.ts`'s/
 * `series.actions.ts`'s category-row builders (`vod.categories`/
 * `series.categories`). Category names cascade for free from the second
 * site: `vodCategoryName()`/`seriesCategoryName()` read back the
 * already-cleaned `vod.categories`/`series.categories` state, so a row's
 * `group` field and a detail's `categoryName` never need a second call.
 * Stored catalog memory (`vodMemory`/`seriesMemory`), search keys
 * (`VodItem.searchKey`/`SeriesItem.searchKey`, built from the raw name), and
 * everything Live/Radio/Categories-owned keep the raw provider string.
 */

/**
 * One leading decoration tag: `| XX |` / `|XX|`, `┃XX┃`, or `[XX]`, where
 * `XX` is 1-6 uppercase letters/digits. Matching delimiter required on both
 * sides (never a bare `[NL` or lone `|`), and the token is uppercase-only so
 * short *real* words (`[Uncut]`, `(4K remaster)` with mixed case) are never
 * mistaken for a provider tag.
 */
const LEADING_TAG = /^\s*(?:\|\s*([A-Z0-9]{1,6})\s*\||┃\s*([A-Z0-9]{1,6})\s*┃|\[\s*([A-Z0-9]{1,6})\s*\])\s*/u;

/**
 * Repeatedly strips `LEADING_TAG` from the front of `raw`, then collapses
 * whitespace. Falls back to the original string untouched whenever stripping
 * would leave nothing (a name that was only a tag) — never emits an empty
 * display name.
 */
export function cleanCatalogDisplayName(raw: string): string {
    let working = raw;
    while (LEADING_TAG.test(working)) {
        working = working.replace(LEADING_TAG, '');
    }
    const cleaned = working.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : raw;
}
