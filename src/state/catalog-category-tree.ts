import { findCountryByPrefix, matchesCountry } from '../channels/country-language-map';
import { parseCategoryName } from '../channels/name-parse';
import type { XtreamCategory } from '../xtream/types';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { normalizeCategoryName, serviceIdFor } from './catalog-popularity';
import { sortCategoriesCountryFirst } from './catalog-sort';

/**
 * Folds a provider's Movies/TV Shows category list into one accordion row
 * per *service*, with the near-duplicates hidden behind it.
 *
 * Real Xtream panels ship the same streaming service a dozen times over,
 * once per country and once per editorial slice — `| NL | NETFLIX`,
 * `| FR | NETFLIX`, `NETFLIX`, `| NL | NETFLIX KIDS`, `| US | NETFLIX BLACK
 * LEAD`… Once `catalog-clean-name.ts` has stripped the leading `| XX |`
 * tags (which it must — repeated on every row they are pure noise), several
 * of those collapse to the identical word "NETFLIX" and the rail reads as
 * broken. Sorting cannot fix that: the entries are genuinely distinct
 * categories, there are just far too many of them to list flat.
 *
 * So the rail lists one row per group — the viewer's own local version when
 * the provider has one — and hands it an expand triangle. Opening it lists
 * the rest, each labelled by *what makes it different* (`FR`, `KIDS`,
 * `US · BLACK LEAD`) rather than by the service name they all share.
 *
 * Everything here is pure string/array work over `XtreamCategory[]`, with
 * one small stateful wrapper (`createCategoryRail()`) holding which heads
 * are open. No Spektrum, no DOM: `vod.actions.ts`/`series.actions.ts`
 * publish `rows()` into `vod.categories`/`series.categories` and the
 * existing single-level `data-each` renders it unchanged.
 */

/**
 * One rendered rail row. The array is flat — an expanded head is simply
 * followed by its variants — because the rail's `data-each` is single-level
 * and its ↑/↓ keyboard walks siblings (`groups.actions.ts`); a nested shape
 * would cost both for no gain.
 */
export interface CategoryRailRow {
    id: string;
    /** What the row reads: the service for a head, the difference for a variant. */
    name: string;
    /** True on a head that has variants under it — the row carrying the triangle. */
    hasVariants: boolean;
    /** True while this head's variants are listed beneath it. */
    expanded: boolean;
    /** True on a variant row — indented, and never itself expandable. */
    variant: boolean;
}

interface Member {
    id: string;
    /** Provider name with its country tag and decoration stripped: `NETFLIX KIDS`. */
    label: string;
    /** Recognized country token (uppercase), or null when the name carried none. */
    country: string | null;
    /** Untouched provider name — the last-resort label when nothing else tells two variants apart. */
    raw: string;
    /** Position in the country/popularity-sorted input, so ties keep that order. */
    order: number;
    /** 0 when the name names the viewer's configured country — the "show the local one" key. */
    local: number;
}

interface CategoryGroup {
    head: Member;
    variants: Member[];
}

/** Joins the parts of a variant label (`US · BLACK LEAD`). Punctuation, not copy — nothing here is translated. */
const VARIANT_SEPARATOR = ' · ';

/**
 * Splits one provider name into the country it names and the label that is
 * left. `parseCategoryName()` already knows every bracket convention in the
 * wild, but it will read *any* 2-3 letter token as a country (`[HD]`), so
 * the token is confirmed against the shared country table before it counts
 * — an unrecognized one falls back to cleaning the whole raw name, which
 * strips it as the decoration it is.
 */
function parseMember(category: XtreamCategory, order: number, countryCode: string): Member {
    const parsed = parseCategoryName(category.name);
    const country = parsed.country && findCountryByPrefix(parsed.country) ? parsed.country.toUpperCase() : null;
    return {
        id: category.id,
        label: cleanCatalogDisplayName(country ? parsed.label : category.name),
        country,
        raw: category.name,
        order,
        local: matchesCountry(category.name, countryCode) ? 0 : 1,
    };
}

/**
 * What two categories have to share to be the same rail row.
 *
 * A recognized streaming service (`catalog-popularity.ts`'s table) groups by
 * that service, which is the whole point: `NETFLIX`, `NETFLIX KIDS` and
 * `NETFLIX BLACK LEAD` are one row. Everything else groups only on an
 * identical cleaned label, so `ACTION` from three countries folds together
 * while `ACTION` and `ACTION 4K` deliberately stay apart — for an unnamed
 * category we have no way to tell a qualifier from a different subject.
 */
function groupKeyOf(label: string): string {
    const service = serviceIdFor(label);
    return service ? `svc:${service}` : `name:${normalizeCategoryName(label)}`;
}

function wordsOf(label: string): string[] {
    return label.split(/\s+/u).filter((word) => word.length > 0);
}

/**
 * The part of `label` past what it shares with the head — `NETFLIX BLACK
 * LEAD` under `NETFLIX` is `BLACK LEAD`.
 *
 * Matched on the *normalized* forms, so the head's own name is recognized
 * however the panel spelled it that time (`DISNEY+` and `DISNEY PLUS` are
 * one word run, and a `FR | DISNEY PLUS` variant reads as plain `FR` rather
 * than repeating the service). The words handed back are the provider's own
 * — normalization is for comparing, never for display.
 */
function distinctSuffix(headLabel: string, label: string): string {
    const head = normalizeCategoryName(headLabel);
    const normalized = normalizeCategoryName(label);
    if (normalized === head) return '';
    if (!head || !normalized.startsWith(`${head} `)) return label;
    const extra = wordsOf(normalized.slice(head.length)).length;
    const words = wordsOf(label);
    // Punctuation can make the normalized tail longer than the original
    // one (`4K+` is two normalized words, one real one). Nothing sensible
    // is left to trim in that case, so keep the whole label.
    return extra < words.length ? words.slice(words.length - extra).join(' ') : label;
}

/**
 * What a variant row reads. Country first (only when it differs from the
 * head's — repeating `NL` under a Dutch head says nothing), then whatever
 * the name adds beyond the head's. Two categories that differ in neither
 * fall back to the raw provider name: it is the only thing left that tells
 * them apart, and an unlabelled row would be worse than a noisy one.
 */
function variantLabelFor(head: Member, member: Member): string {
    const parts: string[] = [];
    if (member.country && member.country !== head.country) parts.push(member.country);
    const suffix = distinctSuffix(head.label, member.label);
    if (suffix) parts.push(suffix);
    return parts.length > 0 ? parts.join(VARIANT_SEPARATOR) : member.raw.trim();
}

/** Head first: the viewer's own country, then the plainest name, then provider order. */
function byPreference(a: Member, b: Member): number {
    if (a.local !== b.local) return a.local - b.local;
    const aWords = wordsOf(a.label).length;
    const bWords = wordsOf(b.label).length;
    if (aWords !== bWords) return aWords - bWords;
    return a.order - b.order;
}

/**
 * Groups an already-fetched category list. Input is sorted first by the
 * existing popularity/country rule (`catalog-sort.ts`) and capped there, so
 * grouping never changes which categories reach the rail — only how they
 * are stacked. Group order follows each group's own head, so a service the
 * sort put first stays first.
 */
export function groupCategories(
    categories: readonly XtreamCategory[],
    countryCode: string,
    cap: number,
): CategoryGroup[] {
    const sorted = sortCategoriesCountryFirst(categories, countryCode).slice(0, cap);
    const buckets = new Map<string, Member[]>();
    sorted.forEach((category, order) => {
        const member = parseMember(category, order, countryCode);
        const key = groupKeyOf(member.label);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(member);
        else buckets.set(key, [member]);
    });

    const groups: CategoryGroup[] = [];
    for (const members of buckets.values()) {
        const [head, ...variants] = [...members].sort(byPreference);
        if (head) groups.push({ head, variants });
    }
    return groups.sort((a, b) => a.head.order - b.head.order);
}

export interface CategoryRail {
    /** Rebuilds from a fetched category list. Which heads are open survives a refresh of the same catalog. */
    setCategories: (categories: readonly XtreamCategory[], countryCode: string, cap: number) => void;
    /** The flat render-ready rows: every head, plus the variants of every open one. */
    rows: () => CategoryRailRow[];
    /** Opens/closes one head. Returns false when `categoryId` is not a head with variants, so a caller can skip republishing. */
    toggle: (categoryId: string) => boolean;
    /** Opens whichever head holds `categoryId`, so selecting a variant can never leave it hidden. Returns true when that changed anything. */
    reveal: (categoryId: string) => boolean;
    /**
     * Any category's full label, head or variant, open or collapsed — what a
     * movie/series row's `group` and a detail's `categoryName` show. Read
     * from here rather than back out of the published rows, which by design
     * hold a *shortened* label for variants and drop the collapsed ones
     * entirely.
     */
    displayName: (categoryId: string) => string | null;
    reset: () => void;
}

/** One rail per catalog — `vod-rows.ts` and `series-rows.ts` each own an instance, next to their existing module memory. */
export function createCategoryRail(): CategoryRail {
    let groups: CategoryGroup[] = [];
    let labels = new Map<string, string>();
    let headOf = new Map<string, string>();
    const expanded = new Set<string>();

    return {
        setCategories(categories, countryCode, cap) {
            groups = groupCategories(categories, countryCode, cap);
            labels = new Map();
            headOf = new Map();
            for (const group of groups) {
                labels.set(group.head.id, group.head.label);
                headOf.set(group.head.id, group.head.id);
                for (const variant of group.variants) {
                    labels.set(variant.id, variant.label);
                    headOf.set(variant.id, group.head.id);
                }
            }
        },

        rows() {
            const rows: CategoryRailRow[] = [];
            for (const group of groups) {
                const open = expanded.has(group.head.id);
                rows.push({
                    id: group.head.id,
                    name: group.head.label,
                    hasVariants: group.variants.length > 0,
                    expanded: open && group.variants.length > 0,
                    variant: false,
                });
                if (!open) continue;
                for (const variant of group.variants) {
                    rows.push({
                        id: variant.id,
                        name: variantLabelFor(group.head, variant),
                        hasVariants: false,
                        expanded: false,
                        variant: true,
                    });
                }
            }
            return rows;
        },

        toggle(categoryId) {
            const group = groups.find((candidate) => candidate.head.id === categoryId);
            if (!group || group.variants.length === 0) return false;
            if (expanded.has(categoryId)) expanded.delete(categoryId);
            else expanded.add(categoryId);
            return true;
        },

        reveal(categoryId) {
            const head = headOf.get(categoryId);
            if (!head || head === categoryId || expanded.has(head)) return false;
            expanded.add(head);
            return true;
        },

        displayName: (categoryId) => labels.get(categoryId) ?? null,

        reset() {
            groups = [];
            labels = new Map();
            headOf = new Map();
            expanded.clear();
        },
    };
}
