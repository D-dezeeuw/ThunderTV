import { computed, type State } from 'spektrum';
import type { Route } from '../app/router';
import { strings } from '../app/strings';
import { GROUPS_PANEL_CAP, LIST_GROUPS, LIST_GROUPS_TRUNCATED } from './list-groups';
import { isGridLayout, UI_LIST_LAYOUT, type ListLayoutMap } from './list-layout';
import { SETTINGS_LOCALE } from './settings';
import { UI_ACTIVE_VIEW } from './ui';

export function registerListSelectors(): void {
    /**
     * Whether the shared list is drawing tiles right now. One selector rather
     * than a per-view comparison repeated in markup, and the same question
     * `src/ui/list-bindings.ts` asks the windowing controller — so the class
     * on the container and the scroll math can never disagree about which
     * layout is on screen.
     */
    computed('listGridActive', [UI_LIST_LAYOUT, UI_ACTIVE_VIEW], (state: State) => {
        const ui = (state as { ui?: { listLayout?: Partial<ListLayoutMap>; activeView?: Route } }).ui;
        return isGridLayout(ui?.listLayout, ui?.activeView);
    });

    /** Feature 08.5.6: hides the groups panel entirely for single-group (or no-group) playlists — nothing to navigate. */
    computed('groupsPanelVisible', [LIST_GROUPS], (state: State) => {
        const groups = (state as { list?: { groups?: unknown[] } }).list?.groups;
        return !!groups && groups.length > 1;
    });

    /**
     * Feature 08.5.9: the truncation note for a playlist past the panel's
     * own DOM-cost cap. Depends on `SETTINGS_LOCALE` too — `strings` is a
     * reassigned singleton (`app/strings.ts`), not itself a Spektrum key,
     * so a locale switch alone would otherwise leave this label stale
     * until the next unrelated recompute.
     */
    computed('groupsTruncatedMessage', [LIST_GROUPS_TRUNCATED, SETTINGS_LOCALE], (state: State) => {
        const truncated = (state as { list?: { groupsTruncated?: boolean } }).list?.groupsTruncated;
        return truncated ? strings.list.groupsTruncatedTemplate.replace('{count}', String(GROUPS_PANEL_CAP)) : '';
    });
}
