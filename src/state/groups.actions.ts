import { defineFn, setValue } from 'spektrum';
import { getRows } from '../m3u/channel-memory';
import { resetGroupCache, rowsForGroup } from '../ui/groups';
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
 * Feature 08.5.8: ↑/↓ moves native DOM focus between sibling group buttons
 * (no new Spektrum state needed — the browser's own focus is the cursor),
 * Enter activates the focused button's own click binding, Backspace/←
 * returns to "All channels".
 */
export function handleGroupsPanelKeydown(event: KeyboardEvent | undefined): void {
    if (!event) return;
    const active = document.activeElement as HTMLElement | null;
    switch (event.key) {
        case 'ArrowDown': {
            event.preventDefault();
            (active?.nextElementSibling as HTMLElement | null)?.focus();
            return;
        }
        case 'ArrowUp': {
            event.preventDefault();
            (active?.previousElementSibling as HTMLElement | null)?.focus();
            return;
        }
        case 'Enter':
            active?.click();
            return;
        case 'Backspace':
        case 'ArrowLeft':
            event.preventDefault();
            showAllChannels();
            return;
        default:
            return;
    }
}
