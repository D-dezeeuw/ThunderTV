/**
 * The keys whose object writes must go through `typed.ts`'s `replace()`
 * (UPGRADES U11).
 *
 * **This module imports nothing, and must stay that way.** `typed.ts` is
 * imported by every state module, so anything `typed.ts` reaches becomes
 * part of a cycle with the whole `src/state/` graph — and
 * `registry-keys.ts` sits inside that graph, because it imports each key's
 * name constant from the module that owns it. Reading the flag off
 * `KEY_REGISTRY` at write time would therefore give a different answer
 * depending on which state module the process happened to load first. A
 * literal set has no initialization order to get wrong.
 *
 * `KEY_REGISTRY` still carries `mapShaped: true` on these same keys —
 * that is where the *documentation* lives, next to the owner and the
 * persistence class. `map-shaped-keys.spec.ts` fails if the two disagree,
 * so the duplication cannot rot.
 */
export const MAP_SHAPED_KEYS: ReadonlySet<string> = new Set([
    'ui.listState',
    'favorites.ids',
    'vod.detail',
    'series.detail',
    // `player.active` carries optional fields — `kind`, `radio`, `series` —
    // that only some writers set, which is exactly the deep-merge hazard:
    // starting a movie after an episode used to leave the episode's
    // `series` coordinates on the movie's snapshot, and the next-episode
    // offer (Feature 21.6) then fired for a film. Found by a test that
    // expected no offer and got one.
    'player.active',
    'series.nextPrompt',
]);

/**
 * Spektrum's `setValue()` deep-merges object values, so writing one of
 * these with fewer keys than last time leaves the removed ones behind in
 * live state. `set()` throws on these in dev; `replace()` is the correct
 * write.
 */
export function isMapShapedKey(key: string): boolean {
    return MAP_SHAPED_KEYS.has(key);
}
