import { de } from './strings.de';
import { en } from './strings.en';
import { nl } from './strings.nl';

/**
 * Central strings module (Feature 02.6.7, i18n follow-up). Every
 * user-facing literal lives in `strings.en.ts`/`strings.nl.ts`/`strings.de.ts`
 * — three flat, identically-shaped nested objects, one per locale
 * (`strings.spec.ts` asserts the key sets never drift). This module is the
 * single point that picks which one is "current".
 */
export type Locale = 'en' | 'nl' | 'de';

export const LOCALES: readonly Locale[] = ['en', 'nl', 'de'];

/** Widens `en`'s `as const` literal string types to plain `string` — `nl`/`de` carry the same shape but different literal values, so `Strings` must accept any string at each leaf, not just `en`'s exact copy. */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

export type Strings = Widen<typeof en>;

const DICTS: Record<Locale, Strings> = { en, nl, de };

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getStrings(locale: Locale): Strings {
    return DICTS[locale] ?? en;
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
export function applyLocale(locale: Locale): void {
    strings = getStrings(locale);
}
