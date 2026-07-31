import { defineFn } from 'spektrum';
import type { ChannelRow } from '../m3u/types';
import { GUIDE_CHANNELS, GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY, type GuideChannel } from './guide';
import { buildLiveEpgIndex, matchGuideChannel } from './guide-live-join';
import { clampGuideOffset, GUIDE_SHIFT_MS } from './guide-time';
import { liveChannels, liveDisplayRows } from './live-rows';
import { publishVariantsFor } from './live.actions';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { setActiveChannel } from './player.actions';
import { showReplayedChannel } from './recent.actions';
import type { ActiveChannelSnapshot } from './records';
import { get, set } from './typed';

/**
 * Guide-view interaction (Phase 32 completes what Phase 31 left as a
 * selection-only grid): programme selection, time-window navigation, and
 * playing the channel a programme belongs to.
 */
export function registerGuideActions(): void {
    /**
     * A programme block is a way into its channel, not just a detail
     * selector: picking one marks it selected *and* takes the viewer to the
     * TV tab with that channel on. A grid cell that only filled a box below
     * the grid gave a viewer who found what they wanted no way to watch it.
     *
     * One delegated click handler on the row container, reading the target's
     * own data attributes rather than binding per-block (mirrors
     * `recent.actions.ts`'s `recent/play`).
     */
    defineFn('guide/openProgram', (el, _state, _delta, _value, event) => {
        const target = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-program-key]') ?? el;
        const key = target.dataset['programKey'];
        if (key !== undefined) set(GUIDE_SELECTED_KEY, key);
        const epgId = target.dataset['epgId'];
        if (epgId) playChannelByEpgId(epgId);
    });

    defineFn('guide/shiftEarlier', () => {
        shiftGuide(-GUIDE_SHIFT_MS);
    });
    defineFn('guide/shiftLater', () => {
        shiftGuide(GUIDE_SHIFT_MS);
    });
    defineFn('guide/backToNow', () => {
        set(GUIDE_OFFSET_MS, 0);
    });

    /** Play the channel a guide row belongs to — the row carries the EPG channel id, which `src/epg/match.ts` already bound to a real playable row. */
    defineFn('guide/playChannel', (el, _state, _delta, _value, event) => {
        const target = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-epg-id]') ?? el;
        const epgId = target.dataset['epgId'];
        if (epgId) playChannelByEpgId(epgId);
    });
}

/** Exported for direct testing without a DOM event. */
export function shiftGuide(deltaMs: number): void {
    const current = get<number>(GUIDE_OFFSET_MS) ?? 0;
    set(GUIDE_OFFSET_MS, clampGuideOffset(current + deltaMs));
}

/**
 * Resolves a guide row back to a playable channel, starts it, and lands the
 * viewer on the TV tab with that row selected and scrolled into view.
 *
 * Runs `guide-live-join.ts`'s ladder — the same one that decided this row
 * belonged in the grid at all — so a channel bound by the provider's
 * `epg_channel_id` or by name plays exactly like one the country catalog
 * matched. Matching only on `ChannelRow.epgId`, as this used to, meant every
 * row of an Xtream-sourced guide was unplayable.
 *
 * The navigation goes through `showReplayedChannel()` — the same helper
 * Starred and Recents use — rather than writing `location.hash` directly.
 * That is not tidiness: a bare hash write is a *route change*, and the
 * router stops playback on one, so this used to start a stream and have it
 * killed a moment later by the very navigation meant to show it. The helper
 * arms the exemption, queues the row to be revealed once TV republishes,
 * and handles the already-on-TV case where no `hashchange` would fire.
 *
 * Returns `false` when the currently-built Live list has no row for that
 * channel — a quiet no-op rather than an error, and now a genuinely rare
 * one, since the grid only lists channels the join already resolved.
 */
export function playChannelByEpgId(epgId: string): boolean {
    const row = liveRowForGuideChannel(epgId);
    if (!row) return false;

    // Before `setActiveChannel`: the player dock reacts to it, so the
    // variant strip has to be correct by the time the new channel paints
    // (same ordering `list.actions.ts`'s `playChannelById()` keeps).
    publishVariantsFor(row.id, row.url);
    const snapshot: ActiveChannelSnapshot = {
        id: row.id,
        sourceId: get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) ?? '',
        name: row.name,
        streamUrl: row.url,
        logo: row.logo,
        group: row.group,
        ...(row.radio ? { radio: true } : {}),
    };
    setActiveChannel(snapshot);
    showReplayedChannel(snapshot);
    return true;
}

/**
 * The guide channel id → Live row lookup behind the above.
 *
 * `liveChannels()` and `liveDisplayRows()` are index-aligned by construction
 * — `toDisplayRows()` maps one to the other one-for-one — so a match's
 * `liveIndex` indexes straight into the display rows. The grouped array is
 * what the ladder needs (it carries the identity `key` the name rung
 * compares against); the display row is what the player wants.
 *
 * The guide channel's own `displayName` comes from `guide.channels`, since
 * the name rung has nothing to compare without it. A row picked from a grid
 * that is currently painted always has one.
 */
function liveRowForGuideChannel(guideChannelId: string): ChannelRow | null {
    const rows = liveDisplayRows();
    if (rows.length === 0) return null;

    const channel = (get<GuideChannel[]>(GUIDE_CHANNELS) ?? []).find((candidate) => candidate.id === guideChannelId);
    const match = matchGuideChannel(buildLiveEpgIndex(liveChannels()), {
        id: guideChannelId,
        displayName: channel?.displayName ?? '',
    });
    return match ? rows[match.liveIndex] ?? null : null;
}
