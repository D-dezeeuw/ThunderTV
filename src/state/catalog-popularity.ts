/**
 * How well-known a Movies/Series category's streaming service is, as an
 * ordering weight.
 *
 * Xtream providers hand back `get_vod_categories` in whatever order their
 * panel happens to store it, which mixes the services a viewer opens
 * constantly ("NETFLIX", "DISNEY+") in among long-tail oddities ("Turks nu
 * te zien"). Sorting country-first alone did not help: on a Dutch account
 * nearly every category matches the country, so the result stayed the
 * provider's arbitrary order.
 *
 * The list is deliberately short and hand-ordered rather than derived from
 * item counts — a provider's biggest category is usually not the one you
 * want first, and a weight you can read is a weight you can argue with.
 * Everything not named here keeps its previous relative order behind those
 * that are, so an unrecognized service is never *hidden*, only later.
 */

interface PopularService {
    /** Stable id, for tests and for reading a sort result. */
    id: string;
    /** Matched against the normalized category name — see `normalizeCategoryName()`. */
    patterns: readonly RegExp[];
}

/**
 * Order is the ranking. The first five are the ones this was asked for;
 * the rest are the services that would look conspicuous sitting below a
 * long-tail category once the top of the list is sorted at all.
 */
const POPULAR_SERVICES: readonly PopularService[] = [
    { id: 'netflix', patterns: [/\bnetflix\b/, /\bnflx\b/] },
    { id: 'amazon', patterns: [/\bamazon\b/, /\bprime ?video\b/] },
    { id: 'apple', patterns: [/\bapple ?tv\b/] },
    { id: 'disney', patterns: [/\bdisney\b/] },
    { id: 'viaplay', patterns: [/\bviaplay\b/] },
    { id: 'hbo', patterns: [/\bhbo\b/] },
    { id: 'max', patterns: [/^max\b/, /\bmax originals?\b/] },
    { id: 'skyshowtime', patterns: [/\bsky ?showtime\b/] },
    { id: 'paramount', patterns: [/\bparamount\b/] },
    { id: 'videoland', patterns: [/\bvideoland\b/] },
    { id: 'discovery', patterns: [/\bdiscovery plus\b/] },
    { id: 'peacock', patterns: [/\bpeacock\b/] },
    { id: 'hulu', patterns: [/\bhulu\b/] },
];

/** Sentinel rank for a category naming no service in the table — sorts after every one that does. */
export const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * Lower-cases and flattens the punctuation providers decorate category names
 * with, so `"┃NL┃ DISNEY+ | FILMS"`, `"Disney Plus"` and `"disney+"` all
 * reduce to something the patterns above can match on a word boundary. `+`
 * becomes ` plus ` rather than being dropped, so `discovery+` stays
 * distinguishable from the `discovery` channel bouquet.
 */
export function normalizeCategoryName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\+/g, ' plus ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * A provider's "Top 100" category — the one every panel ships and every
 * viewer opens first, and which the popularity table above cannot rank
 * because it names no service.
 *
 * The rule, chosen over the alternatives and documented here because a
 * looser one costs real categories their place: the **normalized name
 * contains the token `top 100`**, anywhere in it. `normalizeCategoryName()`
 * has already lower-cased and flattened the punctuation, so `"TOP 100"`,
 * `"| NL | Top 100"`, `"Top 100 Films"` and `"Top100"` (which normalizes to
 * one word, hence the optional space) all match, while `"Top 1000"` and
 * `"Stop 100"` do not — `\b` on both ends is what keeps them out.
 */
export function isTopHundredCategory(name: string): boolean {
    return /\btop ?100\b/.test(normalizeCategoryName(name));
}

/** This category's index in `POPULAR_SERVICES`, or `UNRANKED`. */
export function popularityRank(name: string): number {
    const normalized = normalizeCategoryName(name);
    if (!normalized) return UNRANKED;
    for (let i = 0; i < POPULAR_SERVICES.length; i++) {
        const service = POPULAR_SERVICES[i];
        if (service?.patterns.some((pattern) => pattern.test(normalized))) return i;
    }
    return UNRANKED;
}

/**
 * Which service this category names, or null for the long tail. Same table,
 * same matching as `popularityRank()` — the identity behind the rank, which
 * is what `catalog-category-tree.ts` groups a service's dozen country/
 * editorial variants by.
 */
export function serviceIdFor(name: string): string | null {
    const rank = popularityRank(name);
    return rank === UNRANKED ? null : (POPULAR_SERVICES[rank]?.id ?? null);
}

/** The ranked service ids, top first — exported so a spec can assert the order without reaching into the table. */
export function popularServiceIds(): readonly string[] {
    return POPULAR_SERVICES.map((service) => service.id);
}
