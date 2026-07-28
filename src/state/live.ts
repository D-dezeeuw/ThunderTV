import { setValue } from 'spektrum';

/**
 * Live-view state. The rows themselves never land here (they go through
 * the virtual list, like every other channel list) — only the filter
 * readout, so a user who thinks a channel is missing can see *how many*
 * rows were hidden and why, instead of the list silently lying about the
 * provider's catalog.
 */
export const LIVE_STATS = 'live.stats';

export interface LiveStats {
    /** Rows the provider actually shipped for this source. */
    inputRows: number;
    /** Rows shown after grouping — one per real channel. */
    channels: number;
    hiddenByCountry: number;
    hiddenAsJunk: number;
    hiddenAsUnknown: number;
    /** Duplicate rows folded into an existing channel as variants. */
    collapsed: number;
    /**
     * True when "curated channel list only" matched nothing and the view
     * fell back to the unfiltered set. Almost always a naming mismatch
     * rather than an absent channel, so it is surfaced instead of silently
     * showing an empty list.
     */
    strictFellBack: boolean;
    /** A few provider spellings the filter removed — the only way to tell a naming mismatch from a genuinely missing channel. */
    droppedSamples: string[];
}

export const LIVE_STATS_DEFAULT: LiveStats = {
    inputRows: 0,
    channels: 0,
    hiddenByCountry: 0,
    hiddenAsJunk: 0,
    hiddenAsUnknown: 0,
    collapsed: 0,
    strictFellBack: false,
    droppedSamples: [],
};

export function initLiveState(): void {
    setValue(LIVE_STATS, LIVE_STATS_DEFAULT);
}
