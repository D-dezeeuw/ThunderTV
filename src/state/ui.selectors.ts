import { computed, type State } from 'spektrum';
import { parseHash, ROUTE_VALUES, type Route } from '../app/router';
import {
    SETTINGS_NAV_CATEGORIES,
    SETTINGS_NAV_GUIDE,
    SETTINGS_NAV_RADIO,
    SETTINGS_NAV_RECENTS,
    SETTINGS_NAV_SOURCES,
    SETTINGS_NAV_STARRED,
} from './settings';
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
    registerChannelListViewComputed();
    registerRailVisibilityComputeds();
}

/**
 * Live and Categories are two presentations of the same virtual list (see
 * `live.actions.ts`), so the list shell's `data-if` binds to this rather
 * than repeating a two-way route comparison in markup.
 */
function registerChannelListViewComputed(): void {
    computed('view.channelList.active', [UI_ACTIVE_VIEW], (state: State) => {
        const active = (state as { ui?: { activeView?: Route } }).ui?.activeView;
        return active === 'live' || active === 'radio' || active === 'categories';
    });
}

/**
 * Rail visibility. Live has no entry here on purpose: it is the app's home
 * and the fallback every empty state points at, so it must always be
 * reachable — hiding every destination would strand the user with no way
 * back except the settings gear.
 */
const RAIL_TOGGLES: ReadonlyArray<{ name: string; key: string }> = [
    { name: 'radio', key: SETTINGS_NAV_RADIO },
    { name: 'categories', key: SETTINGS_NAV_CATEGORIES },
    { name: 'sources', key: SETTINGS_NAV_SOURCES },
    { name: 'favorites', key: SETTINGS_NAV_STARRED },
    { name: 'recent', key: SETTINGS_NAV_RECENTS },
    { name: 'guide', key: SETTINGS_NAV_GUIDE },
];

function registerRailVisibilityComputeds(): void {
    for (const { name, key } of RAIL_TOGGLES) {
        computed(`rail.${name}.visible`, [key, UI_ACTIVE_VIEW], (state: State) => {
            const enabled = readPath(state, key) !== false;
            // A hidden button still shows while its own view is open —
            // otherwise switching the toggle off from Settings would leave
            // the user standing in a view with no highlighted rail entry
            // and no obvious way back.
            return enabled || (state as { ui?: { activeView?: Route } }).ui?.activeView === name;
        });
    }
}

function readPath(state: State, key: string): unknown {
    return key.split('.').reduce<unknown>((acc, part) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
    }, state);
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
