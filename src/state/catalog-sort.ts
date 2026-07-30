import { matchesCountry } from '../channels/country-language-map';
import { popularityRank } from './catalog-popularity';
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
 *
 * Country is the *second* key now: `catalog-popularity.ts` ranks the
 * well-known streaming services ahead of everything else, because on a
 * single-country account nearly every category matches the country and the
 * country key alone therefore decided almost nothing.
 */
export function sortCategoriesCountryFirst(
    categories: readonly XtreamCategory[],
    countryCode: string,
): XtreamCategory[] {
    const code = countryCode.trim() || 'NL';
    return categories
        .map((category, index) => ({
            category,
            index,
            rank: popularityRank(category.name),
            country: matchesCountry(category.name, code) ? 0 : 1,
        }))
        .sort((a, b) => {
            // Popularity leads. On a single-country account almost every
            // category matched the country, so country-first alone left the
            // provider's arbitrary order essentially intact — the services a
            // viewer actually opens sat wherever the panel happened to put
            // them, next to long-tail entries like "Turks nu te zien".
            if (a.rank !== b.rank) return a.rank - b.rank;
            // Country still decides among everything the table doesn't name,
            // which is the majority of a real catalog.
            if (a.country !== b.country) return a.country - b.country;
            return a.index - b.index;
        })
        .map((entry) => entry.category);
}
