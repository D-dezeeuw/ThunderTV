import { computed, type State } from 'spektrum';
import { strings } from '../app/strings';
import { GROUPS_PANEL_CAP, LIST_GROUPS, LIST_GROUPS_TRUNCATED } from './list-groups';

export function registerListSelectors(): void {
    /** Feature 08.5.6: hides the groups panel entirely for single-group (or no-group) playlists — nothing to navigate. */
    computed('groupsPanelVisible', [LIST_GROUPS], (state: State) => {
        const groups = (state as { list?: { groups?: unknown[] } }).list?.groups;
        return !!groups && groups.length > 1;
    });

    /** Feature 08.5.9: the truncation note for a playlist past the panel's own DOM-cost cap. */
    computed('groupsTruncatedMessage', [LIST_GROUPS_TRUNCATED], (state: State) => {
        const truncated = (state as { list?: { groupsTruncated?: boolean } }).list?.groupsTruncated;
        return truncated ? strings.list.groupsTruncatedTemplate.replace('{count}', String(GROUPS_PANEL_CAP)) : '';
    });
}
