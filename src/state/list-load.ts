import { watch } from 'spektrum';
import type { Route } from '../app/router';
import type { ChannelRecord } from '../core/storage';
import { CHUNK_ROWS } from '../core/storage';
import { getPlatform } from '../core/platform';
import { clearRows, getRows, setRows as setMemoryRows } from '../m3u/channel-memory';
import { makeChannelRowId, type ChannelRow, type GroupMeta } from '../m3u/types';
import { rowsForGroup } from '../ui/groups';
import { resetGroupsForSourceSwitch } from './groups.actions';
import { publishGroups } from './list-groups';
import { setDisplayedRows } from './list-rows';
import { restoreListState } from './list-state-sync';
import { publishRowsForCurrentView, resetLiveForSourceSwitch } from './live.actions';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

const GROUP_NAME_UPPER_SENTINEL = '￿';

/**
 * Feature 08.10.2: the real boot-order loader, replacing the Phase 05 stub —
 * `bootstrap.ts` calls this after `run()`, so the restored session snapshot
 * (§6.4's last-channel cache) is already painted before this heavy path
 * starts. Also the handler behind every later source switch (Feature
 * 08.10.6), via `registerActiveSourceWatch()` below.
 */
export async function loadActiveSource(): Promise<void> {
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);

    resetGroupsForSourceSwitch();
    resetLiveForSourceSwitch();
    clearRows();

    if (!sourceId) {
        publishGroups([]);
        setDisplayedRows([]);
        return;
    }

    const restored = restoreListState(sourceId);
    await loadGroupsFor(sourceId);
    await streamChannelsFor(sourceId);

    if (get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) !== sourceId) return; // superseded mid-stream

    // Live and Radio derive their own row sets from the now-complete catalog
    // (one row per real channel), so neither uses the restored group /
    // scroll position — those describe the raw, ungrouped list.
    const activeView = get<Route>(UI_ACTIVE_VIEW);
    if (activeView === 'live' || activeView === 'radio') {
        publishRowsForCurrentView();
        return;
    }

    if (restored.viewMode === 'groups' && restored.activeGroup) {
        setDisplayedRows(rowsForGroup(getRows(), restored.activeGroup), {
            scrollTop: restored.groupScrollTop,
            selectedId: restored.selectedId,
        });
    } else {
        setDisplayedRows(getRows(), { scrollTop: restored.scrollTop, selectedId: restored.selectedId });
    }
}

/** Subscribes `loadActiveSource()` to every future `playlist.activeSourceId` change (source switches, Feature 08.10.6) — registered once, from `src/ui/list-bindings.ts`, alongside the boot call. */
export function registerActiveSourceWatch(): () => void {
    return watch([PLAYLIST_ACTIVE_SOURCE_ID], () => {
        void loadActiveSource();
    });
}

async function loadGroupsFor(sourceId: string): Promise<void> {
    const storage = getPlatform().storage;
    const groupRecords = await storage.getRange('groups', [sourceId, ''], [sourceId, GROUP_NAME_UPPER_SENTINEL]);
    const groups: GroupMeta[] = groupRecords
        .map((g) => ({ name: g.name, count: g.channelCount, firstIndex: g.firstIndex }))
        .sort((a, b) => a.firstIndex - b.firstIndex);
    publishGroups(groups);
}

/**
 * Feature 08.10.3: reads the `channels` table in `[sourceId, index]` ranges
 * of `CHUNK_ROWS`, publishing the growing accumulated array after every page
 * so a covering-the-restored-position window paints as soon as those rows
 * exist rather than only once the whole source has loaded. Reads strictly in
 * index order (a simpler, documented choice over jumping straight to the
 * chunk containing the restored position — see the Phase 08 tracker's
 * Completion Notes) — acceptable because even a 90k-row source is at most 18
 * `CHUNK_ROWS` pages, each a fast indexed range read.
 */
async function streamChannelsFor(sourceId: string): Promise<void> {
    const storage = getPlatform().storage;
    let offset = 0;
    let accumulated: ChannelRow[] = [];

    for (;;) {
        if (get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) !== sourceId) return; // superseded mid-stream
        const page = await storage.getRange('channels', [sourceId, offset], [sourceId, offset + CHUNK_ROWS - 1]);
        if (page.length === 0) break;

        accumulated = accumulated.concat(page.map((record) => toChannelRow(record, sourceId)));
        setMemoryRows(accumulated);
        setDisplayedRows(accumulated);

        offset += CHUNK_ROWS;
        if (page.length < CHUNK_ROWS) break;
    }
}

function toChannelRow(record: ChannelRecord, sourceId: string): ChannelRow {
    return {
        id: makeChannelRowId(sourceId, record.index),
        name: record.name,
        url: record.url,
        group: record.group,
        logo: record.logo,
        tvgId: record.tvgId,
        radio: record.radio,
        ...(record.drm ? { drm: record.drm } : {}),
    };
}

