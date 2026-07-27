import { groupChannels, toDisplayRows, type GroupedChannel, type GroupingResult } from '../channels/grouping';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { LIVE_STATS } from './live';
import { SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_DROP_JUNK, SETTINGS_LIVE_KNOWN_ONLY } from './settings';
import { get, set } from './typed';

/**
 * The Live view's row source: the raw provider dump run through
 * `groupChannels()` so the list shows one row per real channel instead of
 * six near-identical ones.
 *
 * Held in module memory, not Spektrum state — same rule as
 * `channel-memory.ts`'s full row array (masterplan §6.5's bulk-data
 * bypass). Only the derived *counts* go into state, for the header readout.
 */
let grouped: GroupedChannel[] = [];
let displayRows: ChannelRow[] = [];

/** Options snapshot the current `grouped` was built from — lets `ensureLiveRows()` skip a rebuild when nothing relevant changed. */
let builtFrom = '';

function optionsKey(country: string, knownOnly: boolean, dropJunk: boolean, sourceRows: number): string {
    return `${country}|${knownOnly}|${dropJunk}|${sourceRows}`;
}

/**
 * Rebuilds the grouped view from the channels currently in memory, unless
 * an identical build is already cached. Grouping ~90k rows is a single
 * linear pass, but it runs on every navigation into Live, so the cache
 * keeps view switching free.
 */
export function ensureLiveRows(force = false): void {
    const country = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const knownOnly = get<boolean>(SETTINGS_LIVE_KNOWN_ONLY) ?? false;
    const dropJunk = get<boolean>(SETTINGS_LIVE_DROP_JUNK) ?? true;
    const rows = getRows();

    const key = optionsKey(country, knownOnly, dropJunk, rows.length);
    if (!force && key === builtFrom && displayRows.length > 0) return;

    const result = buildLiveRows(rows, country, knownOnly, dropJunk);
    grouped = result.channels;
    displayRows = toDisplayRows(grouped);
    builtFrom = key;
    publishStats(result);
}

/** Pure core, split out so it can be exercised without touching state or module memory. */
export function buildLiveRows(
    rows: readonly ChannelRow[],
    country: string,
    knownOnly: boolean,
    dropJunk: boolean,
): GroupingResult {
    return groupChannels(rows, {
        // An empty country means "don't filter by country" — passing `''`
        // through would drop every row, since no prefix ever equals `''`.
        ...(country ? { country } : {}),
        knownOnly,
        dropJunk,
    });
}

function publishStats(result: GroupingResult): void {
    set(LIVE_STATS, {
        inputRows: result.stats.inputRows,
        channels: result.stats.keptChannels,
        hiddenByCountry: result.stats.droppedByCountry,
        hiddenAsJunk: result.stats.droppedAsJunk,
        hiddenAsUnknown: result.stats.droppedAsUnknown,
        collapsed: result.stats.collapsedVariants,
    });
}

export function liveDisplayRows(): readonly ChannelRow[] {
    return displayRows;
}

export function liveChannels(): readonly GroupedChannel[] {
    return grouped;
}

/** Discards the cache so the next `ensureLiveRows()` rebuilds — called on source switch and after a settings change. */
export function invalidateLiveRows(): void {
    grouped = [];
    displayRows = [];
    builtFrom = '';
}
