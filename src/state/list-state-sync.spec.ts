import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { LIST_SELECTED_ID } from './list';
import { DEFAULT_PER_SOURCE_LIST_STATE, initListStateModule, UI_ACTIVE_GROUP, UI_LIST_STATE, UI_VIEW_MODE, type ListStateMap } from './list-state';
import { restoreListState, saveListState } from './list-state-sync';
import { resetPersistForTests } from './persist';
import { get } from './typed';

describe('saveListState()/restoreListState() (Feature 08.6.2/08.6.4)', () => {
    afterEach(() => {
        resetState();
        resetPersistForTests();
    });

    it('round-trips a saved patch through Spektrum state', () => {
        initListStateModule();
        tick();
        saveListState('p1', { scrollTop: 880, viewMode: 'groups', activeGroup: 'Sports' });
        tick();
        const map = get<ListStateMap>(UI_LIST_STATE);
        expect(map?.['p1']).toEqual({ ...DEFAULT_PER_SOURCE_LIST_STATE, scrollTop: 880, viewMode: 'groups', activeGroup: 'Sports' });
    });

    it('restoreListState() applies the saved (or default) state to the live keys before first paint', () => {
        initListStateModule();
        tick();
        saveListState('p1', { activeGroup: 'News', viewMode: 'groups', selectedId: 'ch-9' });
        tick();

        const restored = restoreListState('p1');
        tick();

        expect(restored.activeGroup).toBe('News');
        expect(get<string | null>(UI_ACTIVE_GROUP)).toBe('News');
        expect(get<string>(UI_VIEW_MODE)).toBe('groups');
        expect(get<string | null>(LIST_SELECTED_ID)).toBe('ch-9');
    });

    it('restoreListState() for a never-saved source applies the defaults', () => {
        initListStateModule();
        tick();
        const restored = restoreListState('never-seen');
        tick();
        expect(restored).toEqual(DEFAULT_PER_SOURCE_LIST_STATE);
        expect(get<string | null>(UI_ACTIVE_GROUP)).toBeNull();
        expect(get<string>(UI_VIEW_MODE)).toBe('all');
    });
});
