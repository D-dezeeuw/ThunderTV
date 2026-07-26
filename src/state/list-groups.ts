import { setValue } from 'spektrum';
import type { GroupMeta } from '../m3u/types';
import { set } from './typed';

/** The groups panel's own row set (Feature 08.5.1) — a plain state array since real playlists have at most a few hundred groups; capped independently of Phase 06's `MAX_GROUPS` (10,000) extraction cap so a pathological playlist can never flood the panel's DOM either (Feature 08.5.9). */
export const LIST_GROUPS = 'list.groups';
export const LIST_GROUPS_TRUNCATED = 'list.groupsTruncated';

export const GROUPS_PANEL_CAP = 500;

export function initListGroupsState(): void {
    setValue(LIST_GROUPS, []);
    setValue(LIST_GROUPS_TRUNCATED, false);
}

/** Publishes the groups panel's row set, truncated to `GROUPS_PANEL_CAP` — `groupsTruncated` drives a "too many groups to list" note instead of silently dropping the tail. */
export function publishGroups(groups: readonly GroupMeta[]): void {
    const capped = groups.slice(0, GROUPS_PANEL_CAP);
    set(LIST_GROUPS, capped);
    setValue(LIST_GROUPS_TRUNCATED, groups.length > GROUPS_PANEL_CAP);
}
