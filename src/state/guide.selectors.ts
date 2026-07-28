import { computed, type State } from 'spektrum';
import { EPG_TICK } from './epg';
import { computeGuideWindow, computeProgramLayout, formatClockTime, formatTimeRange, isProgramNow, percentInRange } from './guide-time';
import { GUIDE_CHANNELS, GUIDE_SELECTED_KEY, guideProgramKey, type GuideChannel } from './guide';

interface GuideShapedState extends State {
    guide?: { channels?: GuideChannel[]; selectedKey?: string | null };
    epg?: { tick?: number };
}

export interface GuideProgramView {
    key: string;
    title: string;
    leftPercent: number;
    widthPercent: number;
    isNow: boolean;
    isSelected: boolean;
}

export interface GuideChannelView {
    id: string;
    displayName: string;
    icon: string | null;
    programs: GuideProgramView[];
}

export interface GuideSelectedView {
    title: string;
    description: string;
    channelName: string;
    timeLabel: string;
}

export interface GuideView {
    channels: GuideChannelView[];
    hasData: boolean;
    nowPercent: number;
    rangeStartLabel: string;
    rangeEndLabel: string;
    selected: GuideSelectedView | null;
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
    computed('guide.view', [GUIDE_CHANNELS, GUIDE_SELECTED_KEY, EPG_TICK], (state: State): GuideView => {
        const shaped = state as GuideShapedState;
        const channels = shaped.guide?.channels ?? [];
        const selectedKey = shaped.guide?.selectedKey ?? null;
        const nowMs = shaped.epg?.tick ?? Date.now();
        const range = computeGuideWindow(nowMs);

        let selected: GuideSelectedView | null = null;

        const channelViews: GuideChannelView[] = channels.map((channel) => {
            const programs: GuideProgramView[] = channel.programs
                .filter((program) => program.stop > range.start && program.start < range.end)
                .map((program) => {
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
                        leftPercent: layout.leftPercent,
                        widthPercent: layout.widthPercent,
                        isNow: isProgramNow(nowMs, program.start, program.stop),
                        isSelected,
                    };
                });
            return { id: channel.id, displayName: channel.displayName, icon: channel.icon, programs };
        });

        return {
            channels: channelViews,
            hasData: channels.length > 0,
            nowPercent: percentInRange(nowMs, range.start, range.end),
            rangeStartLabel: formatClockTime(range.start),
            rangeEndLabel: formatClockTime(range.end),
            selected,
        };
    });
}
