import { setValue } from 'spektrum';

/**
 * Per-source list UI state (Feature 08.6.1) — scroll position, view mode,
 * active group, and selection, keyed by playlist source id. Small enough to
 * persist through the Phase 05 bridge (§6.3): this whole map, not raw
 * scroll-frame data (Feature 08.6.2/08.6.3 debounce that at the call site).
 *
 * Pure constants/types/helpers only — no `persist()` import here on purpose:
 * `registry.ts` imports these key constants, and `persist.ts` imports
 * `registry.ts`, so this file importing `persist.ts` back would be a real
 * ESM import cycle (found the hard way: a computed `[UI_LIST_STATE]` object
 * key silently evaluated to `undefined` while the cycle was still
 * resolving). `state/list-state-sync.ts` holds the two functions that
 * actually call `persist()`.
 */
export const UI_LIST_STATE = 'ui.listState';
/** The *live* mirrors of the currently-open source's view mode/group — what index.html's templates actually bind to; restored from `UI_LIST_STATE` on source entry, written live on every user toggle. */
export const UI_ACTIVE_GROUP = 'ui.activeGroup';
export const UI_VIEW_MODE = 'ui.viewMode';

export type ListViewMode = 'all' | 'groups';

export interface PerSourceListState {
    /** All-channels view scroll position (Feature 08.6.6). */
    scrollTop: number;
    /** Group-expansion view scroll position — tracked separately so toggling views round-trips both (Feature 08.6.6). */
    groupScrollTop: number;
    viewMode: ListViewMode;
    activeGroup: string | null;
    selectedId: string | null;
}

export type ListStateMap = Record<string, PerSourceListState>;

/** Feature 08.6.7: the map stays localStorage-friendly by capping at the last 20 touched sources. */
export const LIST_STATE_LRU_CAP = 20;

export const DEFAULT_PER_SOURCE_LIST_STATE: PerSourceListState = {
    scrollTop: 0,
    groupScrollTop: 0,
    viewMode: 'all',
    activeGroup: null,
    selectedId: null,
};

export function initListStateModule(): void {
    setValue(UI_LIST_STATE, {});
    setValue(UI_ACTIVE_GROUP, DEFAULT_PER_SOURCE_LIST_STATE.activeGroup);
    setValue(UI_VIEW_MODE, DEFAULT_PER_SOURCE_LIST_STATE.viewMode);
}

/** Reads `sourceId`'s saved state, or the default if it was never saved. */
export function getPerSourceListState(map: ListStateMap, sourceId: string): PerSourceListState {
    return map[sourceId] ?? DEFAULT_PER_SOURCE_LIST_STATE;
}

/**
 * Upserts `sourceId`'s entry (merged with its previous state) and moves it
 * to most-recently-used, evicting the least-recently-used entry past
 * `LIST_STATE_LRU_CAP` (Feature 08.6.7). Pure — returns a new map. Relies on
 * plain-object insertion order for non-numeric string keys (spec-guaranteed,
 * ECMA-262 §OrdinaryOwnPropertyKeys) — source ids are `crypto.randomUUID()`
 * strings, never integer-index-like, so this ordering is reliable.
 */
export function upsertListState(map: ListStateMap, sourceId: string, patch: Partial<PerSourceListState>): ListStateMap {
    const merged: PerSourceListState = { ...getPerSourceListState(map, sourceId), ...patch };
    const withoutSource = Object.fromEntries(Object.entries(map).filter(([id]) => id !== sourceId));
    const next: ListStateMap = { ...withoutSource, [sourceId]: merged };

    const ids = Object.keys(next);
    if (ids.length <= LIST_STATE_LRU_CAP) return next;
    const capped = { ...next };
    for (const id of ids.slice(0, ids.length - LIST_STATE_LRU_CAP)) delete capped[id];
    return capped;
}
