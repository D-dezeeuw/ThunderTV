import { defineFn } from 'spektrum';
import { GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY } from './guide';
import { clampGuideOffset, GUIDE_SHIFT_MS } from './guide-time';
import { liveDisplayRows } from './live-rows';
import { publishVariantsFor } from './live.actions';
import { setActiveChannel } from './player.actions';
import { get, set } from './typed';

/**
 * Guide-view interaction (Phase 32 completes what Phase 31 left as a
 * selection-only grid): programme selection, time-window navigation, and
 * playing the channel a programme belongs to.
 */
export function registerGuideActions(): void {
    /** Program-block selection — one delegated click handler on the row container, reading the target's own data attribute rather than binding per-block (mirrors `recent.actions.ts`'s `recent/play`). */
    defineFn('guide/selectProgram', (el, _state, _delta, _value, event) => {
        const target = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-program-key]') ?? el;
        const key = target.dataset['programKey'];
        if (key !== undefined) set(GUIDE_SELECTED_KEY, key);
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
 * Resolves a guide row back to a playable channel and starts it.
 *
 * The join is `ChannelRow.epgId` — the Phase 31 matcher's output, already
 * carried onto every published Live row — so this is a lookup, never a
 * second round of name matching. Returns `false` when the currently-built
 * Live list has no row for that EPG channel: the Guide describes the whole
 * country's catalog, so it legitimately shows channels this particular
 * subscription doesn't carry, and that must be a quiet no-op rather than an
 * error (the grid is still useful for reading what's on elsewhere).
 */
export function playChannelByEpgId(epgId: string): boolean {
    const row = liveDisplayRows().find((candidate) => candidate.epgId === epgId);
    if (!row) return false;

    publishVariantsFor(row.id, row.url);
    setActiveChannel({
        id: row.id,
        sourceId: '',
        name: row.name,
        streamUrl: row.url,
        logo: row.logo,
        group: row.group,
        ...(row.radio ? { radio: true } : {}),
    });
    location.hash = '#/live';
    return true;
}
