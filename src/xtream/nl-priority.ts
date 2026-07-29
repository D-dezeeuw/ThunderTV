import { matchesCountry } from '../channels/country-language-map';
import type { XtreamCategory } from './types';

/**
 * MVP heuristic for "Dutch channels first" — matches a standalone `NL`
 * token (the near-universal Xtream category-naming convention, e.g.
 * `"NL | ENTERTAINMENT"`, `"NL: SPORT"`) or an explicit country/language
 * name (`Nederland`, `Dutch`, `Holland`). Word-boundary matching avoids
 * false positives like "ONLINE"/"ONLY". Thin wrapper around the generalized,
 * synonym-aware `matchesCountry()` — see `src/channels/country-language-map.ts`.
 */
export function isDutchCategory(name: string): boolean {
    return matchesCountry(name, 'NL');
}

/** Stable sort — Dutch categories first, original provider order preserved within each group. */
export function sortCategoriesNlFirst(categories: readonly XtreamCategory[]): XtreamCategory[] {
    return categories
        .map((category, index) => ({ category, index }))
        .sort((a, b) => {
            const da = isDutchCategory(a.category.name) ? 0 : 1;
            const db = isDutchCategory(b.category.name) ? 0 : 1;
            return da !== db ? da - db : a.index - b.index;
        })
        .map((entry) => entry.category);
}
