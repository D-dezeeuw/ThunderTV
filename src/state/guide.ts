import { setValue } from 'spektrum';

/**
 * Guide-view state: a live projection of the `epgChannels`/`epgPrograms`
 * storage tables (`guide-load.ts` builds it, mirroring `favorites.ts`'s
 * `favorites.ids` pattern), plus the one piece of view-local UI state
 * (which program block is selected).
 */
export const GUIDE_CHANNELS = 'guide.channels';
export const GUIDE_SELECTED_KEY = 'guide.selectedKey';
export const GUIDE_LOADING = 'guide.loading';
/**
 * How far the visible timetable window is shifted from "now", in ms
 * (Phase 32). Zero means the window tracks the clock; the prev/next
 * controls move it in `GUIDE_SHIFT_MS` steps. Deliberately an *offset*
 * rather than an absolute window start: at offset 0 the grid keeps
 * following the `epg.tick` heartbeat with no extra bookkeeping, and
 * "back to now" is a single write of 0.
 */
export const GUIDE_OFFSET_MS = 'guide.offsetMs';

export interface GuideProgram {
    channelId: string;
    start: number;
    stop: number;
    title: string;
    description: string | null;
}

export interface GuideChannel {
    id: string;
    displayName: string;
    icon: string | null;
    programs: GuideProgram[];
}

export function initGuideState(): void {
    setValue(GUIDE_CHANNELS, []);
    setValue(GUIDE_SELECTED_KEY, null);
    setValue(GUIDE_LOADING, false);
    setValue(GUIDE_OFFSET_MS, 0);
}

/** Stable identity for one program block — channel + start is unique per `epgPrograms`' own composite key. */
export function guideProgramKey(channelId: string, start: number): string {
    return `${channelId}|${String(start)}`;
}
