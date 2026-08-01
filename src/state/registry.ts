import { KEY_REGISTRY } from './registry-keys';

/**
 * The registry's query surface. The table itself lives in
 * `registry-keys.ts` — a pure data module that grows by one entry per new
 * key, which is exactly the growth the ≤300-line convention (masterplan §7)
 * is not meant to fight. Everything else still imports from `./registry`:
 * `KEY_REGISTRY`/`KeyMeta` are re-exported here unchanged.
 */
export { KEY_REGISTRY } from './registry-keys';
export type { KeyMeta } from './registry-keys';

/** `strings` (the plain-TS copy mirror, Feature 02.1) and `blankImage` (the transparent-pixel `:src` fallback, `blank-image.ts`) are deliberately outside this registry — both are static reference data, not application state, and neither is ever a candidate for persistence. */
export const NON_REGISTRY_KEYS = ['strings', 'blankImage'] as const;

export function isRegisteredKey(key: string): boolean {
    return key in KEY_REGISTRY;
}

export function isPersistedKey(key: string): boolean {
    return KEY_REGISTRY[key]?.persisted === true;
}

export function keyVersion(key: string): number {
    return KEY_REGISTRY[key]?.version ?? 1;
}

/** UPGRADES U11: keys whose object writes must go through `typed.ts`'s `replace()`, because Spektrum's deep merge would leave removed keys behind. Re-exported from the leaf module `typed.ts` reads — see `map-shaped-keys.ts` for why the write-time check cannot consult `KEY_REGISTRY`. */
export { isMapShapedKey, MAP_SHAPED_KEYS } from './map-shaped-keys';

/** Every key marked `persisted: true` — the exact list Feature 05.4.2's boot rehydration `getMany`s, so adding a persisted key automatically joins boot restore. */
export function persistedKeys(): string[] {
    return Object.keys(KEY_REGISTRY).filter((key) => isPersistedKey(key));
}
