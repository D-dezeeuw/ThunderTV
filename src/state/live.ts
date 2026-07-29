import { setValue } from 'spektrum';

/**
 * Live-view state. The rows themselves never land here (they go through
 * the virtual list, like every other channel list) — only the filter
 * readout, so a user who thinks a channel is missing can see *how many*
 * rows were hidden and why, instead of the list silently lying about the
 * provider's catalog.
 */
export const LIVE_STATS = 'live.stats';

/**
 * How many stations the Radio list ended up with. A count, not the rows —
 * the rows go through the virtual list like every other channel list. It
 * exists so an empty Radio view can say *why* it is empty instead of
 * rendering a blank box with a header over it.
 */
export const RADIO_COUNT = 'live.radioCount';

export interface LiveStats {
    /** Rows the provider actually shipped for this source. */
    inputRows: number;
    /** Rows shown after grouping — one per real channel. */
    channels: number;
    hiddenByCountry: number;
    hiddenAsJunk: number;
    hiddenAsUnknown: number;
    /** Dropped by "EPG-verified channels only" — the country catalog had no match (Feature 31.6.4). */
    hiddenByEpg: number;
    /** Duplicate rows folded into an existing channel as variants. */
    collapsed: number;
    /** How many kept channels carry an EPG match, independent of whether the verified-only filter is even on — the Settings readout's "matched" count (Feature 31.7.5). */
    epgMatched: number;
    /**
     * True when "curated channel list only" matched nothing and the view
     * fell back to the unfiltered set. Almost always a naming mismatch
     * rather than an absent channel, so it is surfaced instead of silently
     * showing an empty list.
     */
    strictFellBack: boolean;
    /** Same fallback, for "EPG-verified channels only" (Feature 31.6.3) — the catalog hasn't matched anything yet (not fetched, wrong country) rather than the channel genuinely lacking guide data. */
    epgFellBack: boolean;
    /** A few provider spellings the filter removed — the only way to tell a naming mismatch from a genuinely missing channel. */
    droppedSamples: string[];
}

export const LIVE_STATS_DEFAULT: LiveStats = {
    inputRows: 0,
    channels: 0,
    hiddenByCountry: 0,
    hiddenAsJunk: 0,
    hiddenAsUnknown: 0,
    hiddenByEpg: 0,
    collapsed: 0,
    epgMatched: 0,
    strictFellBack: false,
    epgFellBack: false,
    droppedSamples: [],
};

export function initLiveState(): void {
    setValue(LIVE_STATS, LIVE_STATS_DEFAULT);
    setValue(RADIO_COUNT, 0);
}
