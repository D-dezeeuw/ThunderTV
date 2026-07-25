import { history, onRecord } from 'spektrum';

/**
 * Spektrum's `historyLimit` (masterplan §5.8) is a `createSpektrum(opts)`
 * constructor option (confirmed against the pinned `spektrum@1.1.0`
 * `.d.ts`/vendored source — Feature 05.7.2) — there is no runtime setter on
 * the default singleton this app uses via the top-level `setValue`/
 * `computed`/… imports, and switching the whole app off that singleton
 * onto a `createSpektrum()`-constructed instance would touch every module
 * that imports from `'spektrum'` for a policy this narrow.
 *
 * Adapted instead via the closest supported mechanism (Feature 05.7.2's
 * "if the API differs, implement the closest supported mechanism and note
 * the decision" allowance): `onRecord()` fires once per recorded mutation,
 * and `history` — `readonly` only at the TypeScript level, a real mutable
 * array at runtime — can be trimmed directly. Dev keeps the most recent
 * `DEV_HISTORY_LIMIT` entries; prod trims to 0 after every record, which is
 * behaviorally equivalent to "disabled" (`replay()` has nothing to replay).
 */
const DEV_HISTORY_LIMIT = 200;

let unsubscribe: (() => void) | null = null;

export function applyHistoryPolicy(): void {
    unsubscribe?.();
    const limit = import.meta.env.PROD ? 0 : DEV_HISTORY_LIMIT;
    unsubscribe = onRecord(() => {
        if (history.length > limit) {
            history.splice(0, history.length - limit);
        }
    });
}

/** Test-only: undoes `applyHistoryPolicy()` so specs don't leak a recorder into unrelated tests. */
export function resetHistoryPolicyForTests(): void {
    unsubscribe?.();
    unsubscribe = null;
    history.splice(0, history.length);
}

/** The current cap, for specs/diagnostics — mirrors the branch `applyHistoryPolicy()` took without re-deriving `import.meta.env.PROD` twice. */
export function currentHistoryLimit(): number {
    return import.meta.env.PROD ? 0 : DEV_HISTORY_LIMIT;
}
