import { setValue } from 'spektrum';
import { setSelectedId } from './list';
import {
    UI_ACTIVE_GROUP,
    UI_LIST_STATE,
    UI_VIEW_MODE,
    getPerSourceListState,
    upsertListState,
    type ListStateMap,
    type PerSourceListState,
} from './list-state';
import { persist } from './persist';
import { get, replace } from './typed';

/**
 * The two functions every list action calls to keep `ui.listState` (Feature
 * 08.6.1-08.6.4) in sync — split out from `list-state.ts` so that file can
 * stay `persist()`-import-free (see its own header comment for the ESM
 * cycle this avoids).
 */

/** Merges `patch` into `sourceId`'s saved state and schedules a debounced persist (Feature 08.6.2). Callable directly — no DOM event triggers this (Feature 05.2.7 precedent). `replace()`, not `set()` — `upsertListState()`'s LRU eviction (Feature 08.6.7) removes keys, which a merge-onto-existing `set()` would never actually clear from live state (see `typed.ts`'s `replace()` doc comment). */
export function saveListState(sourceId: string, patch: Partial<PerSourceListState>): void {
    const current = get<ListStateMap>(UI_LIST_STATE) ?? {};
    replace(UI_LIST_STATE, upsertListState(current, sourceId, patch));
    persist(UI_LIST_STATE);
}

/**
 * Applies `sourceId`'s saved (or default) state to the live keys a fresh
 * source-entry reads before its first `setRows`/`publishWindow` (Feature
 * 08.6.4/08.6.8) — restore-before-first-paint. Returns the resolved state so
 * the caller (`state/list-load.ts`) can also feed `scrollTop`/
 * `groupScrollTop` into the windowing controller and `src/ui/groups.ts`'s
 * group filter without a second read.
 */
export function restoreListState(sourceId: string): PerSourceListState {
    const map = get<ListStateMap>(UI_LIST_STATE) ?? {};
    const state = getPerSourceListState(map, sourceId);
    setValue(UI_ACTIVE_GROUP, state.activeGroup);
    setValue(UI_VIEW_MODE, state.viewMode);
    setSelectedId(state.selectedId);
    return state;
}
