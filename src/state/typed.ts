import { appState, getPathObj, setValue as spektrumSetValue } from 'spektrum';
import { assertCompact } from './bulk-policy';

/**
 * Thin typed wrappers around Spektrum's `setValue`/`getPathObj` (Feature
 * 05.9.2). Actions/selectors use these instead of the raw imports so the
 * dev-mode bulk-data guard (Feature 05.8.2) is unavoidable at the one
 * choke point every write goes through, and callers get inference from
 * `TStateValue` instead of writing `as` casts at every call site.
 */
export function set<T>(key: string, value: T): void {
    if (import.meta.env.DEV) assertCompact(key, value);
    spektrumSetValue(key, value);
}

export function get<T>(key: string): T | undefined {
    return getPathObj<T>(appState, key);
}
