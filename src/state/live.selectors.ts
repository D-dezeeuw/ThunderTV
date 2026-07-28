import { computed, type State } from 'spektrum';
import type { Route } from '../app/router';
import type { ChannelVariant } from '../m3u/types';
import { LIVE_STATS, RADIO_COUNT, type LiveStats } from './live';
import { UI_ACTIVE_VIEW } from './ui';

interface LiveShapedState extends State {
    live?: { stats?: Partial<LiveStats>; radioCount?: number };
    ui?: { activeView?: Route };
    player?: { variants?: ChannelVariant[] };
    activeSource?: { channelCount?: number } | null;
}

export function registerLiveSelectors(): void {
    registerHiddenCountComputed();
    registerFilteredEverythingComputed();
    registerHasVariantsComputed();
    registerDroppedSamplesComputed();
    registerRadioIsEmptyComputed();
}

/**
 * The Radio view, on a source that shipped channels but no stations. A
 * blank list under a header reads as a broken app, so this gates a real
 * empty state that says which of the two it is.
 */
function registerRadioIsEmptyComputed(): void {
    computed('radioIsEmpty', [RADIO_COUNT, UI_ACTIVE_VIEW, 'activeSource.channelCount'], (state: State) => {
        const shaped = state as LiveShapedState;
        if (shaped.ui?.activeView !== 'radio') return false;
        return (shaped.activeSource?.channelCount ?? 0) > 0 && (shaped.live?.radioCount ?? 0) === 0;
    });
}

/**
 * The provider's own spelling of a few filtered-out rows. This is the
 * difference between "your provider doesn't carry it" and "we failed to
 * recognize the name" — without it a missing channel is unexplainable.
 */
function registerDroppedSamplesComputed(): void {
    computed('liveDroppedSamples', [LIVE_STATS], (state: State) => {
        return ((state as LiveShapedState).live?.stats?.droppedSamples ?? []).join(', ');
    });
}

/** One number for the header rather than three: the breakdown by reason is diagnostic detail, not something to spend list-header space on. */
function registerHiddenCountComputed(): void {
    computed('liveHiddenCount', [LIVE_STATS], (state: State) => {
        const stats = (state as LiveShapedState).live?.stats;
        if (!stats) return 0;
        return (stats.hiddenByCountry ?? 0) + (stats.hiddenAsJunk ?? 0) + (stats.hiddenAsUnknown ?? 0);
    });
}

/**
 * True only when the source *has* channels and the Live filter removed all
 * of them — deliberately distinct from an empty source, because it is the
 * one case where the filter, not the provider, is at fault, and the empty
 * state offers escape hatches accordingly.
 */
function registerFilteredEverythingComputed(): void {
    computed('liveFilteredEverything', [LIVE_STATS, UI_ACTIVE_VIEW], (state: State) => {
        const shaped = state as LiveShapedState;
        if (shaped.ui?.activeView !== 'live') return false;
        const stats = shaped.live?.stats;
        return (stats?.inputRows ?? 0) > 0 && (stats?.channels ?? 0) === 0;
    });
}

/** The strip is meaningless with a single feed, so it only appears when a real choice exists. */
function registerHasVariantsComputed(): void {
    computed('hasVariants', ['player.variants'], (state: State) => {
        return ((state as LiveShapedState).player?.variants?.length ?? 0) > 1;
    });
}
