import { computed, type State } from 'spektrum';
import { EPG_TICK } from './epg';
import {
    computeGuideWindow,
    computeProgramLayout,
    formatClockTime,
    formatTimeRange,
    formatWindowDate,
    isProgramNow,
    percentInRange,
} from './guide-time';
import { GUIDE_CHANNELS, GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY, guideProgramKey, type GuideChannel } from './guide';
import { liveDisplayRows } from './live-rows';

interface GuideShapedState extends State {
    guide?: { channels?: GuideChannel[]; selectedKey?: string | null; offsetMs?: number };
    epg?: { tick?: number };
}

export interface GuideProgramView {
    key: string;
    title: string;
    /** Index into `GuideView.channels` — which row's grid track this block belongs to. A flat, sibling `data-each` (not nested inside the channel rows' own `data-each`) needs this to place each block, since Spektrum's `data-each` does not reliably (re)bind when nested inside another `data-each`'s per-item template — see `src/state/README.md`'s "Two Spektrum gotchas" note, the same reason `series.detail.rows` flattened seasons/episodes into one list. */
    channelIndex: number;
    leftPercent: number;
    widthPercent: number;
    isNow: boolean;
    isSelected: boolean;
}

export interface GuideChannelView {
    id: string;
    displayName: string;
    icon: string | null;
}

export interface GuideSelectedView {
    title: string;
    description: string;
    channelName: string;
    timeLabel: string;
}

export interface GuideView {
    channels: GuideChannelView[];
    /** Flat across every channel — see `GuideProgramView.channelIndex`'s doc for why this isn't nested under `channels`. */
    programs: GuideProgramView[];
    hasData: boolean;
    /** `-1` when "now" falls outside the visible window — the markup hides the indicator rather than pinning it to an edge, which would read as a real position. */
    nowPercent: number;
    rangeStartLabel: string;
    rangeEndLabel: string;
    /** Empty while the window tracks the clock; a weekday/date once shifted. */
    dateLabel: string;
    /** True when the window has been shifted off "now" — drives the "back to now" control's visibility. */
    isShifted: boolean;
    selected: GuideSelectedView | null;
}

/**
 * Reorders the Guide's channels to match the Live tab's own order —
 * `groupChannels()`'s broadcast-rank order (`src/channels/grouping.ts`),
 * consumed here via `liveDisplayRows()` — instead of `guide-load.ts`'s
 * plain alphabetical storage order. The join is the same `ChannelRow.epgId`
 * `guide.actions.ts`'s `playChannelByEpgId()` already uses. A Guide channel
 * with no matching Live row (the country catalog legitimately lists more
 * than this subscription carries) sorts after every matched one, keeping
 * its prior alphabetical order among itself.
 */
function orderChannelsLikeLive(channels: readonly GuideChannel[]): GuideChannel[] {
    const rank = new Map<string, number>();
    liveDisplayRows().forEach((row, index) => {
        if (row.epgId && !rank.has(row.epgId)) rank.set(row.epgId, index);
    });
    return [...channels].sort((a, b) => {
        const rankA = rank.get(a.id) ?? Number.POSITIVE_INFINITY;
        const rankB = rank.get(b.id) ?? Number.POSITIVE_INFINITY;
        return rankA - rankB;
    });
}

/**
 * One `computed('guide.view', ...)` doing all the per-tick shaping
 * (window, layout, formatting, selection) in a single pass — index.html
 * binds directly to its output, so the template stays declarative markup
 * rather than growing its own per-field computed dependency list. Recomputes
 * on every `epg.tick` beat (Feature 05.5's global heartbeat) so the "now"
 * line and which block reads as current stay live without a per-row timer.
 */
export function registerGuideSelectors(): void {
    computed('guide.view', [GUIDE_CHANNELS, GUIDE_SELECTED_KEY, GUIDE_OFFSET_MS, EPG_TICK], (state: State): GuideView => {
        const shaped = state as GuideShapedState;
        const channels = orderChannelsLikeLive(shaped.guide?.channels ?? []);
        const selectedKey = shaped.guide?.selectedKey ?? null;
        const nowMs = shaped.epg?.tick ?? Date.now();
        const offsetMs = shaped.guide?.offsetMs ?? 0;
        // The window is placed from the *shifted* instant, but "now" stays the
        // real clock — that's what makes the now-line correctly leave the
        // frame once the user browses to another part of the day.
        const range = computeGuideWindow(nowMs + offsetMs);

        let selected: GuideSelectedView | null = null;

        const channelViews: GuideChannelView[] = channels.map((channel) => ({
            id: channel.id,
            displayName: channel.displayName,
            icon: channel.icon,
        }));

        // Flat across every channel, not nested under `channels` — each block
        // carries its own `channelIndex` (see `GuideProgramView`'s doc) so the
        // markup can render it as a sibling `data-each`, placed onto the right
        // grid row/track by index rather than by DOM nesting.
        const programViews: GuideProgramView[] = channels.flatMap((channel, channelIndex) =>
            channel.programs
                .filter((program) => program.stop > range.start && program.start < range.end)
                .map((program): GuideProgramView => {
                    const key = guideProgramKey(program.channelId, program.start);
                    const layout = computeProgramLayout(program.start, program.stop, range.start, range.end);
                    const isSelected = key === selectedKey;
                    if (isSelected) {
                        selected = {
                            title: program.title,
                            description: program.description ?? '',
                            channelName: channel.displayName,
                            timeLabel: formatTimeRange(program.start, program.stop),
                        };
                    }
                    return {
                        key,
                        title: program.title,
                        channelIndex,
                        leftPercent: layout.leftPercent,
                        widthPercent: layout.widthPercent,
                        isNow: isProgramNow(nowMs, program.start, program.stop),
                        isSelected,
                    };
                }),
        );

        const nowInWindow = nowMs >= range.start && nowMs <= range.end;
        return {
            channels: channelViews,
            programs: programViews,
            hasData: channels.length > 0,
            nowPercent: nowInWindow ? percentInRange(nowMs, range.start, range.end) : -1,
            rangeStartLabel: formatClockTime(range.start),
            rangeEndLabel: formatClockTime(range.end),
            dateLabel: offsetMs === 0 ? '' : formatWindowDate(range.start),
            isShifted: offsetMs !== 0,
            selected,
        };
    });
}
