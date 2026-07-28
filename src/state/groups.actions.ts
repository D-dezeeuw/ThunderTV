import { defineFn, setValue } from 'spektrum';
import { getRows } from '../m3u/channel-memory';
import { resetGroupCache, rowsForGroup } from '../ui/groups';
import { scrollToIndex } from '../ui/virtual-list';
import { setDisplayedRows } from './list-rows';
import { UI_ACTIVE_GROUP, UI_VIEW_MODE } from './list-state';
import { saveListState } from './list-state-sync';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';

/**
 * Group panel interactions (Feature 08.5): jump-to-group within the
 * unfiltered "All channels" view (08.5.2, no filtering — just a scroll),
 * expand-into-group (08.5.3, filters via `setDisplayedRows`), and
 * show-all-channels (the reverse). All three update the live
 * `ui.viewMode`/`ui.activeGroup` keys and persist into the active source's
 * saved list state in the same call (Feature 08.5.5/08.5.7).
 */
export function registerGroupActions(): void {
    defineFn('list/jumpToGroup', (el) => {
        const firstIndex = el.dataset['firstIndex'];
        if (firstIndex === undefined) return;
        scrollToIndex(Number(firstIndex));
    });

    defineFn('list/expandGroup', (el) => {
        const name = el.dataset['group'];
        if (name === undefined) return;
        expandGroup(name);
    });

    defineFn('list/showAllChannels', () => {
        showAllChannels();
    });

    defineFn('list/handleGroupsPanelKeydown', (_el, _state, _delta, _value, event) => {
        handleGroupsPanelKeydown(event as KeyboardEvent | undefined);
    });

    // Movies/Series use the same `.groups-panel` rail with a catalog's
    // categories behind it, so they share its focus movement — but not its
    // Backspace/← escape, which republishes *channel* rows and would be
    // nonsense from a catalog view.
    defineFn('list/handleCategoryRailKeydown', (_el, _state, _delta, _value, event) => {
        handleCategoryRailKeydown(event as KeyboardEvent | undefined);
    });
}

/** Feature 08.5.3/08.5.4: filters to one group's rows, reusing the entire windowing/binding stack unchanged. */
export function expandGroup(groupName: string): void {
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!sourceId) return;
    const rows = rowsForGroup(getRows(), groupName);
    setValue(UI_VIEW_MODE, 'groups');
    setValue(UI_ACTIVE_GROUP, groupName);
    setDisplayedRows(rows);
    saveListState(sourceId, { viewMode: 'groups', activeGroup: groupName, groupScrollTop: 0 });
}

export function showAllChannels(): void {
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!sourceId) return;
    setValue(UI_VIEW_MODE, 'all');
    setValue(UI_ACTIVE_GROUP, null);
    setDisplayedRows(getRows());
    saveListState(sourceId, { viewMode: 'all', activeGroup: null });
}

/** Source-switch hook (Feature 08.10.7): drops the group filter cache so a stale filtered array from the previous source can never leak into the next one. */
export function resetGroupsForSourceSwitch(): void {
    resetGroupCache();
}

/**
 * Feature 08.5.8: ↑/↓ moves native DOM focus between sibling rail buttons
 * (no new Spektrum state needed — the browser's own focus is the cursor),
 * Enter activates the focused button's own click binding. This half is
 * about the *rail component*, not about channel groups, so the Movies/
 * Series category rails share it verbatim. Returns true when it consumed
 * the key.
 */
export function handleCategoryRailKeydown(event: KeyboardEvent | undefined): boolean {
    if (!event) return false;
    const active = document.activeElement as HTMLElement | null;
    switch (event.key) {
        case 'ArrowDown': {
            event.preventDefault();
            (active?.nextElementSibling as HTMLElement | null)?.focus();
            return true;
        }
        case 'ArrowUp': {
            event.preventDefault();
            (active?.previousElementSibling as HTMLElement | null)?.focus();
            return true;
        }
        case 'Enter':
            active?.click();
            return true;
        default:
            return false;
    }
}

/** The groups panel's own keyboard: the shared rail movement above, plus Backspace/← as "back to All channels" — a channel-list escape the catalog rails deliberately don't get. */
export function handleGroupsPanelKeydown(event: KeyboardEvent | undefined): void {
    if (!event) return;
    if (handleCategoryRailKeydown(event)) return;
    if (event.key === 'Backspace' || event.key === 'ArrowLeft') {
        event.preventDefault();
        showAllChannels();
    }
}
