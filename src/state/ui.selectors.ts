import { computed, type State } from 'spektrum';
import { parseHash, ROUTE_VALUES, type Route } from '../app/router';
import { UI_ACTIVE_VIEW, UI_STORAGE_NOTICE_DISMISSED } from './ui';

/**
 * Registers every `ui`-owned computed, migrated from `src/app/shell.ts` and
 * `src/ui/storage-notice.ts` as part of Phase 05's selector consolidation
 * (Feature 05.6.1/05.6.5/05.6.6).
 */
export function registerUiSelectors(): void {
    registerViewActiveComputeds();
    registerConnectDetectedComputed();
    registerStorageNoticeVisibleComputed();
}

/** One `computed('view.<route>.active', ...)` per route (Feature 02.5.2/05.6.5) — index.html's per-section `data-if` binds to these, never to a raw `ui.activeView === '...'` comparison repeated in markup. */
function registerViewActiveComputeds(): void {
    for (const route of ROUTE_VALUES) {
        computed(`view.${route}.active`, [UI_ACTIVE_VIEW], (state: State) => {
            return (state as { ui?: { activeView?: Route } }).ui?.activeView === route;
        });
    }
}

/**
 * Registered once at setup — a real fix over the Phase 02 original, which
 * re-registered this `computed()` from inside a `watch()` callback on every
 * `ui.activeView` change (found during the Phase 05 migration survey: a
 * working-but-wasteful pattern, since Spektrum's `computed()` already
 * re-derives on any dependency change without needing re-registration).
 * Re-parses the *current* `location.hash` — already resolved by router.ts's
 * hashchange listener — purely to learn whether params were present. Never
 * reads or stores the params themselves; router.ts remains the only writer
 * of `ui.activeView`.
 */
function registerConnectDetectedComputed(): void {
    computed('connect.detected', [UI_ACTIVE_VIEW], (state: State) => {
        const active = (state as { ui?: { activeView?: Route } }).ui?.activeView;
        if (active !== 'connect') return false;
        return parseHash(location.hash).params.toString().length > 0;
    });
}

function registerStorageNoticeVisibleComputed(): void {
    computed('storageNotice.visible', ['storage.tier', UI_STORAGE_NOTICE_DISMISSED], (state: State) => {
        const tier = (state as { storage?: { tier?: string } }).storage?.tier;
        const dismissed = (state as { ui?: { storageNoticeDismissed?: boolean } }).ui?.storageNoticeDismissed ?? false;
        return (tier === 'partial' || tier === 'none') && !dismissed;
    });
}
