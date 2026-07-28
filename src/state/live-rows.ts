import { groupChannels, toDisplayRows, type GroupedChannel, type GroupingResult } from '../channels/grouping';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { LIVE_STATS } from './live';
import { SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_DROP_JUNK, SETTINGS_LIVE_KNOWN_ONLY } from './settings';
import { get, replace } from './typed';

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
let radioGrouped: GroupedChannel[] = [];
let radioRows: ChannelRow[] = [];

/** Options snapshot each cache was built from — lets the ensure* calls skip a rebuild when nothing relevant changed. */
let builtFrom = '';
let radioBuiltFrom = '';

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

    // Strict mode must never hand back an empty screen. If the curated list
    // matched nothing at all — a provider spelling the catalog has never
    // seen, not an absent channel — fall back to the unfiltered set and say
    // so in the header. A blank list teaches the user nothing; a full list
    // plus "the curated list matched nothing" tells them exactly what broke.
    let result = buildLiveRows(rows, country, knownOnly, dropJunk);
    let fellBack = false;
    if (knownOnly && result.channels.length === 0 && rows.length > 0) {
        const loose = buildLiveRows(rows, country, false, dropJunk);
        if (loose.channels.length > 0) {
            // Keep the *strict* run's rejected names: the loose run dropped
            // nothing, so its samples are empty, and those names are the
            // entire point of the message.
            result = { channels: loose.channels, stats: { ...loose.stats, droppedSamples: result.stats.droppedSamples } };
            fellBack = true;
        }
    }
    grouped = result.channels;
    displayRows = toDisplayRows(grouped);
    builtFrom = key;
    publishStats(result, fellBack);
}

/**
 * The Radio list. Same country and filler filtering, but never `knownOnly`
 * — the curated catalog lists TV channels, so applying it here would empty
 * the list outright rather than narrow it.
 */
export function ensureRadioRows(force = false): void {
    const country = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const dropJunk = get<boolean>(SETTINGS_LIVE_DROP_JUNK) ?? true;
    const rows = getRows();

    const key = optionsKey(country, false, dropJunk, rows.length);
    if (!force && key === radioBuiltFrom && radioRows.length > 0) return;

    const result = groupChannels(rows, {
        ...(country ? { country } : {}),
        dropJunk,
        radio: 'only',
    });
    radioGrouped = result.channels;
    radioRows = toDisplayRows(radioGrouped);
    radioBuiltFrom = key;
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
        radio: 'exclude',
    });
}

function publishStats(result: GroupingResult, strictFellBack = false): void {
    replace(LIVE_STATS, {
        inputRows: result.stats.inputRows,
        channels: result.stats.keptChannels,
        hiddenByCountry: result.stats.droppedByCountry,
        hiddenAsJunk: result.stats.droppedAsJunk,
        hiddenAsUnknown: result.stats.droppedAsUnknown,
        collapsed: result.stats.collapsedVariants,
        strictFellBack,
        droppedSamples: result.stats.droppedSamples,
    });
}

export function liveDisplayRows(): readonly ChannelRow[] {
    return displayRows;
}

export function liveChannels(): readonly GroupedChannel[] {
    return grouped;
}

export function radioDisplayRows(): readonly ChannelRow[] {
    return radioRows;
}

/** Discards the cache so the next `ensureLiveRows()` rebuilds — called on source switch and after a settings change. */
export function invalidateLiveRows(): void {
    grouped = [];
    displayRows = [];
    builtFrom = '';
    radioGrouped = [];
    radioRows = [];
    radioBuiltFrom = '';
}
