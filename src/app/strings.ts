import { en } from './strings.en';

/**
 * Central strings module (Feature 02.6.7, i18n follow-up). Every
 * user-facing literal lives in `strings.en.ts`/`strings.nl.ts`/`strings.de.ts`
 * — three flat, identically-shaped nested objects, one per locale
 * (`strings.spec.ts` asserts the key sets never drift). This module is the
 * single point that picks which one is "current".
 *
 * **`en` is imported eagerly; `nl`/`de` are not.** All three dictionaries
 * together were ~44 kB of the entry chunk, so every user downloaded three
 * languages to read one. `en` stays static because it is the baseline the
 * `Strings` type is derived from and the fallback whenever a locale fails to
 * load; the other two arrive through `loadStrings()` as their own chunks.
 *
 * The cost of that is one extra (parallel, few-kB) fetch before first paint
 * for a non-English user, since `applyLocale()` is awaited during boot —
 * paying a small startup cost for the minority rather than a permanent
 * payload cost for everyone.
 */
export type Locale = 'en' | 'nl' | 'de';

export const LOCALES: readonly Locale[] = ['en', 'nl', 'de'];

/** Widens `en`'s `as const` literal string types to plain `string` — `nl`/`de` carry the same shape but different literal values, so `Strings` must accept any string at each leaf, not just `en`'s exact copy. */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

export type Strings = Widen<typeof en>;

/** Resolved dictionaries, so switching back to a previously-used locale never refetches. */
const cache = new Map<Locale, Strings>([['en', en]]);

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The active copy for `locale`, fetching its chunk on first use. A failed
 * import (offline mid-session, a chunk pruned by a stale service worker)
 * falls back to `en` rather than rejecting — a language switch must never be
 * able to leave the UI with no copy at all.
 */
export async function loadStrings(locale: Locale): Promise<Strings> {
    const cached = cache.get(locale);
    if (cached !== undefined) return cached;

    try {
        const loaded =
            locale === 'nl' ? (await import('./strings.nl')).nl : (await import('./strings.de')).de;
        cache.set(locale, loaded);
        return loaded;
    } catch {
        return en;
    }
}

/**
 * The active locale's copy, re-assigned (never mutated in place) by
 * `applyLocale()`. Exported as a `let` rather than a `const` so ES module
 * live bindings do the propagation: every module that does
 * `import { strings } from '../app/strings'` and reads `strings.x.y`
 * *at call time* (every selector/action in this codebase does — none
 * hoists a nested value into a module-scope constant) automatically sees
 * the current locale's copy without re-importing anything.
 */
export let strings: Strings = en;

/**
 * Swaps the active locale's copy. Called once at boot (via
 * `state/index.ts`'s `seedStrings()`, using the rehydrated
 * `settings.locale`) and again on every live language switch
 * (`state/settings.actions.ts`'s `setLocale()`), which also mirrors the
 * new copy into Spektrum's `strings` state key for `{{ }}`/`:attr`
 * template bindings — this function only updates the plain-TS side.
 */
export async function applyLocale(locale: Locale): Promise<void> {
    strings = await loadStrings(locale);
}
