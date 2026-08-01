import { appState, getPathObj, setValue as spektrumSetValue, tick } from 'spektrum';
import { assertCompact } from './bulk-policy';
import { isMapShapedKey } from './map-shaped-keys';

/**
 * Thin typed wrappers around Spektrum's `setValue`/`getPathObj` (Feature
 * 05.9.2). Actions/selectors use these instead of the raw imports so the
 * dev-mode bulk-data guard (Feature 05.8.2) is unavoidable at the one
 * choke point every write goes through, and callers get inference from
 * `TStateValue` instead of writing `as` casts at every call site.
 */
export function set<T>(key: string, value: T): void {
    if (import.meta.env.DEV) {
        assertCompact(key, value);
        // UPGRADES U11. The merge hazard below used to be prevented by a
        // README paragraph asking the next author to remember; this is the
        // same rule as a gate. Arrays are exempt because Spektrum's merge
        // already excludes them, and `null`/scalars cannot merge at all —
        // only a plain object on a map-shaped key is the bug.
        if (isMapShapedKey(key) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            throw new Error(
                `state: set("${key}") with an object value deep-merges onto live state, so keys removed by this write would survive it. Use replace() from state/typed.ts (state/README.md's merge-hazard section; UPGRADES U11).`,
            );
        }
    }
    spektrumSetValue(key, value);
}

export function get<T>(key: string): T | undefined {
    return getPathObj<T>(appState, key);
}

/**
 * A true `path` replacement, for the object-shaped state values (`favorites.ids`,
 * `ui.listState`) where a write sometimes needs to *remove* a key —
 * `setValue()`/`set()` deep-merge object-valued writes onto the existing
 * state rather than replacing them (verified directly: a second
 * `setValue(path, {a: 99})` after `setValue(path, {a: 1, b: 2})` leaves `b`
 * in place), so a plain `set(path, objectWithFewerKeys)` would silently
 * leave the removed key behind in *live* state. Resetting to `undefined`
 * first and draining that with one explicit `tick()` forces the following
 * write to start from an empty object instead of merging onto the stale
 * one — confirmed by direct probe against the vendored engine. The second
 * write is left for the caller's own natural next tick to drain (`run()`'s
 * rAF loop in production, an explicit `tick()` in tests), exactly like
 * `set()`'s existing contract.
 */
export function replace<T>(key: string, value: T): void {
    if (import.meta.env.DEV) assertCompact(key, value);
    spektrumSetValue(key, undefined);
    tick();
    spektrumSetValue(key, value);
}
