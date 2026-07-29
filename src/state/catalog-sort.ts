import { matchesCountry } from '../channels/country-language-map';
import type { XtreamCategory } from '../xtream/types';

/**
 * Generalizes `src/xtream/nl-priority.ts`'s `sortCategoriesNlFirst()` to
 * whichever country the user has actually configured (`settings.liveCountry`),
 * via the shared `matchesCountry()` table (`src/channels/country-language-map.ts`)
 * instead of a hard-coded Dutch regex. Used by the VOD/series catalog open
 * actions (`vod.actions.ts`/`series.actions.ts`) to sort `get_vod_categories`/
 * `get_series_categories` the same "matching country first" way Live already
 * sorts/filters, and to auto-select the first (now country-matching, if any
 * matched) category — see those files for the auto-select decision.
 *
 * An empty/unrecognized country code falls back to `'NL'` — the same
 * default `settings.liveCountry` itself ships with
 * (`SETTINGS_DEFAULTS.liveCountry`, `state/settings.ts`), so a fresh
 * install's Movies/Series catalogs sort exactly like Live's own NL-first
 * convention until the user picks something else.
 */
export function sortCategoriesCountryFirst(
    categories: readonly XtreamCategory[],
    countryCode: string,
): XtreamCategory[] {
    const code = countryCode.trim() || 'NL';
    return categories
        .map((category, index) => ({ category, index }))
        .sort((a, b) => {
            const da = matchesCountry(a.category.name, code) ? 0 : 1;
            const db = matchesCountry(b.category.name, code) ? 0 : 1;
            return da !== db ? da - db : a.index - b.index;
        })
        .map((entry) => entry.category);
}
