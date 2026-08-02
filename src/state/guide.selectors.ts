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
import type { GroupedChannel } from '../channels/grouping';
import { GUIDE_CHANNELS, GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY, guideProgramKey, type GuideChannel } from './guide';
import { bindGuideChannelsToLive, type GuideRowBinding } from './guide-live-join';
import { EPG_FEED_THROUGH } from './epg-settings';
import { SETTINGS_LOCALE } from './settings';
import { LIVE_STATS } from './live';
import { liveChannels } from './live-rows';

interface GuideShapedState extends State {
    guide?: { channels?: GuideChannel[]; selectedKey?: string | null; offsetMs?: number };
    epg?: { tick?: number };
    settings?: { locale?: string; epgFeedThrough?: number };
}

export interface GuideProgramView {
    key: string;
    title: string;
    /** The guide channel this block belongs to — carried onto the block so clicking a programme can go to that channel, not just select the block. */
    channelId: string;
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
    /** `-1` when "now" falls outside the visible window — the markup hides the indicator rather than pinning it to an edge, which would read as a real position. A percent *of the program track* (grid column 2), not of the whole grid row — the label column must not offset it. */
    nowPercent: number;
    /** The now-line's `grid-row` end line — `channels.length + 1`, spanning every channel row. The grid's rows are all implicit (`grid-auto-rows`), so the markup cannot say `1 / -1`; negative lines only count explicit tracks. */
    nowRowEnd: number;
    rangeStartLabel: string;
    rangeEndLabel: string;
    /** Empty while the window tracks the clock; a weekday/date once shifted. */
    dateLabel: string;
    /** True when the window has been shifted off "now" — drives the "back to now" control's visibility. */
    isShifted: boolean;
    selected: GuideSelectedView | null;
    /**
     * A formatted date when the feed's newest programme is already in the
     * past, otherwise `''`. Non-empty means the upstream XMLTV source has
     * stopped being updated, which is a completely different problem from
     * "no guide data yet" and needs to say so — an empty grid with a
     * generic empty state reads as an app bug.
     */
    staleThroughLabel: string;
}

/**
 * Restricts the Guide to the channels Live actually carries, in Live's own
 * order — `groupChannels()`'s broadcast-rank order (`src/channels/
 * grouping.ts`), read here via `liveChannels()`.
 *
 * Filtering, not just sorting, is the fix for "the guide shows different
 * channels than Live". A guide document legitimately describes a superset of
 * one subscription — the country catalog covers everything broadcast in the
 * country, and a panel's `xmltv.php` covers the whole account including
 * whatever the Live filters hid. Listing the extras offered rows that do
 * nothing when picked and pushed the channels the viewer does have further
 * down the grid.
 *
 * The join itself lives in `guide-live-join.ts` (tvg-id → catalog id → name);
 * `guide.actions.ts`'s `playChannelByEpgId()` resolves a picked row back
 * through the same ladder, so what the grid shows and what a click plays
 * cannot drift apart.
 *
 * It also returns the Live channel each row bound to, which is where the
 * row's **name** comes from — never the feed's own `<display-name>`. A
 * provider's XMLTV spells a channel however it likes, and the Guide showing
 * one name while the TV list shows another is a bug however good the
 * feed's spelling happens to be.
 *
 * **Empty until Live propagates, deliberately.** This used to hand back the
 * whole feed whenever the join produced nothing, on the theory that a
 * populated grid beats a blank one. It doesn't: with an Xtream source that
 * branch fired on every boot (nothing fills `epgId` there) and painted
 * thousands of alphabetically-sorted channels the viewer's list does not
 * show. Waiting is the honest answer, and the wait is short — the view
 * depends on `live.stats`, which changes the moment those rows are built.
 */
function rowsShownInLiveOrder(channels: readonly GuideChannel[]): GuideRowBinding<GuideChannel, GroupedChannel>[] {
    return bindGuideChannelsToLive(channels, liveChannels());
}

/**
 * One `computed('guide.view', ...)` doing all the per-tick shaping
 * (window, layout, formatting, selection) in a single pass — index.html
 * binds directly to its output, so the template stays declarative markup
 * rather than growing its own per-field computed dependency list. Recomputes
 * on every `epg.tick` beat (Feature 05.5's global heartbeat) so the "now"
 * line and which block reads as current stay live without a per-row timer.
 *
 * `live.stats` is in the dependency list for `channelsShownInLiveOrder()`'s
 * sake: the Live rows themselves are module memory (the bulk-data bypass),
 * so this is the one published value that changes exactly when they are
 * rebuilt. Without it the grid stayed unnarrowed until the next 30s tick
 * happened to re-run it — "the Guide is wrong, then right a moment later".
 */
export function registerGuideSelectors(): void {
    computed('guide.view', [GUIDE_CHANNELS, GUIDE_SELECTED_KEY, GUIDE_OFFSET_MS, EPG_TICK, SETTINGS_LOCALE, EPG_FEED_THROUGH, LIVE_STATS], (state: State): GuideView => {
        const shaped = state as GuideShapedState;
        // The app's own locale, not the webview's — see `formatClockTime`.
        const locale = shaped.settings?.locale;
        const rows = rowsShownInLiveOrder(shaped.guide?.channels ?? []);
        const selectedKey = shaped.guide?.selectedKey ?? null;
        const nowMs = shaped.epg?.tick ?? Date.now();
        const offsetMs = shaped.guide?.offsetMs ?? 0;
        const feedThrough = shaped.settings?.epgFeedThrough ?? 0;
        // The window is placed from the *shifted* instant, but "now" stays the
        // real clock — that's what makes the now-line correctly leave the
        // frame once the user browses to another part of the day.
        const range = computeGuideWindow(nowMs + offsetMs);

        let selected: GuideSelectedView | null = null;

        // `live.name`, not `channel.displayName`: the row is labelled with
        // the name the TV list shows for it. The feed's own spelling is only
        // ever a second opinion about a channel this app has already named.
        const channelViews: GuideChannelView[] = rows.map(({ channel, live }) => ({
            id: channel.id,
            displayName: live.name,
            icon: channel.icon,
        }));

        // Flat across every channel, not nested under `channels` — each block
        // carries its own `channelIndex` (see `GuideProgramView`'s doc) so the
        // markup can render it as a sibling `data-each`, placed onto the right
        // grid row/track by index rather than by DOM nesting.
        const programViews: GuideProgramView[] = rows.flatMap(({ channel, live }, channelIndex) =>
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
                            channelName: live.name,
                            timeLabel: formatTimeRange(program.start, program.stop, locale),
                        };
                    }
                    return {
                        key,
                        title: program.title,
                        channelId: channel.id,
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
            hasData: rows.length > 0,
            nowPercent: nowInWindow ? percentInRange(nowMs, range.start, range.end) : -1,
            nowRowEnd: rows.length + 1,
            rangeStartLabel: formatClockTime(range.start, locale),
            rangeEndLabel: formatClockTime(range.end, locale),
            dateLabel: offsetMs === 0 ? '' : formatWindowDate(range.start, locale),
            isShifted: offsetMs !== 0,
            selected,
            staleThroughLabel: feedThrough > 0 && feedThrough < nowMs ? formatWindowDate(feedThrough, locale) : '',
        };
    });
}
