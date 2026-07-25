import { appState, getPathObj } from 'spektrum';
import { getPlatform } from '../core/platform';
import type { VersionedEnvelope } from '../core/storage';
import { isPersistedKey, keyVersion } from './registry';

/**
 * Actions explicitly mark keys dirty; one 500ms-debounced flush snapshots
 * every dirty key into a single `storage.setMany()` call (masterplan §6.3)
 * — no framework introspection, deterministic, testable.
 */
const DEBOUNCE_MS = 500;

const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Marks `key` dirty and (re)starts the debounce window. Throws in dev for a key the registry doesn't mark `persisted` — Feature 05.3.2 — so a typo or an unregistered key fails at the call site, not silently. */
export function persist(key: string): void {
    if (import.meta.env.DEV && !isPersistedKey(key)) {
        throw new Error(`persist("${key}"): not marked persisted in KEY_REGISTRY (state/registry.ts).`);
    }
    dirty.add(key);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
        void flushNow();
    }, DEBOUNCE_MS);
}

/** Reads the live value for `key` out of `appState` and wraps it in the Feature 04.9 version envelope. */
function snapshot(key: string): VersionedEnvelope {
    return { v: keyVersion(key), data: getPathObj(appState, key) };
}

/**
 * Drains every currently-dirty key into one `setMany`. Exported (marked
 * `@internal`) for specs and the pagehide flush (Feature 05.3.8) — safe to
 * call with nothing dirty (no-op).
 * @internal
 */
export async function flushNow(): Promise<void> {
    if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
    }
    if (dirty.size === 0) return;

    const batch = [...dirty];
    dirty.clear();

    const entries: [string, VersionedEnvelope][] = batch.map((key) => [key, snapshot(key)]);
    const result = await getPlatform().storage.setMany(entries);
    if (!result.ok) {
        // Feature 05.3.4: re-mark dirty and let the tier controller's own
        // demotion (Phase 04.7) handle the underlying cause — retried on
        // the next debounce window, never a hot loop, never thrown into an
        // action.
        for (const key of batch) dirty.add(key);
    }
}

/** @internal */
export function pendingKeys(): string[] {
    return [...dirty];
}

/** Test-only: clears the dirty-key set and cancels a pending debounce timer without flushing — the `bind-dom.ts` harness's per-mount isolation (Feature 05.10.2). Never call from app code. */
export function resetPersistForTests(): void {
    if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
    }
    dirty.clear();
}

/**
 * The read-side counterpart to `snapshot()` — unwraps a stored envelope for
 * boot rehydration (Feature 05.4.4). A missing key, a corrupt/non-envelope
 * blob, or a version this build doesn't recognize all resolve `undefined`
 * with one redacted diagnostic — a bad snapshot must never brick startup.
 * No migration chain is consulted: every current key is at v1, and v1 is
 * the only version that has ever existed (see `KeyMeta.version`'s TSDoc).
 */
export function unwrapPersisted(key: string, raw: unknown): unknown {
    if (typeof raw !== 'object' || raw === null || !('v' in raw) || !('data' in raw)) {
        return undefined;
    }
    const envelope = raw as VersionedEnvelope;
    if (envelope.v !== keyVersion(key)) {
        console.warn(`[ThunderTV] state: stored "${key}" is at v${String(envelope.v)}, expected v${String(keyVersion(key))} — skipped.`);
        return undefined;
    }
    return envelope.data;
}

/** Forces a best-effort flush when the tab is being hidden/closed (Feature 05.3.5). */
export function registerPersistOnHide(): () => void {
    const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') void flushNow();
    };
    const onPageHide = () => {
        void flushNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
    };
}
