import { groupChannels, toDisplayRows, type GroupedChannel, type GroupingResult } from '../channels/grouping';
import { getMappingSync } from '../epg/match';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { LIVE_STATS, RADIO_COUNT } from './live';
import { SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_DROP_JUNK, SETTINGS_LIVE_EPG_VERIFIED_ONLY, SETTINGS_LIVE_KNOWN_ONLY } from './settings';
import { get, replace, set } from './typed';

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

function optionsKey(
    country: string,
    knownOnly: boolean,
    dropJunk: boolean,
    epgVerifiedOnly: boolean,
    epgMatchCount: number,
    sourceRows: number,
): string {
    return `${country}|${knownOnly}|${dropJunk}|${epgVerifiedOnly}|${epgMatchCount}|${sourceRows}`;
}

/** Channel key → catalog id, from `src/epg/match.ts`'s sync mapping cache for the currently selected country (Feature 31.6.1's `epgMatches` input). */
function epgMatchesFor(country: string): Map<string, string> {
    if (!country) return new Map();
    return new Map(getMappingSync(country).map((m) => [m.channelKey, m.catalogId]));
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
    const epgVerifiedOnly = get<boolean>(SETTINGS_LIVE_EPG_VERIFIED_ONLY) ?? false;
    const rows = getRows();
    const epgMatches = epgMatchesFor(country);

    const key = optionsKey(country, knownOnly, dropJunk, epgVerifiedOnly, epgMatches.size, rows.length);
    if (!force && key === builtFrom && displayRows.length > 0) return;

    let result = buildLiveRows(rows, country, knownOnly, dropJunk, epgMatches, epgVerifiedOnly);
    let strictFellBack = false;
    let epgFellBack = false;

    // Strict mode must never hand back an empty screen. If the curated list
    // matched nothing at all — a provider spelling the catalog has never
    // seen, not an absent channel — fall back to the unfiltered set and say
    // so in the header. A blank list teaches the user nothing; a full list
    // plus "the curated list matched nothing" tells them exactly what broke.
    if (knownOnly && result.channels.length === 0 && rows.length > 0) {
        const loose = buildLiveRows(rows, country, false, dropJunk, epgMatches, epgVerifiedOnly);
        if (loose.channels.length > 0) {
            result = { channels: loose.channels, stats: { ...loose.stats, droppedSamples: result.stats.droppedSamples } };
            strictFellBack = true;
        }
    }
    // Same never-empty-screen rule for the EPG filter — "the catalog hasn't
    // matched anything yet" (not fetched, wrong country selected) is far
    // more likely than "every channel is genuinely unverifiable."
    if (epgVerifiedOnly && result.channels.length === 0 && rows.length > 0) {
        const loose = buildLiveRows(rows, country, knownOnly, dropJunk, epgMatches, false);
        if (loose.channels.length > 0) {
            result = { channels: loose.channels, stats: { ...loose.stats, droppedSamples: result.stats.droppedSamples } };
            epgFellBack = true;
        }
    }

    grouped = result.channels;
    displayRows = toDisplayRows(grouped);
    builtFrom = key;
    publishStats(result, strictFellBack, epgFellBack);
}

/**
 * The Radio list. Same country and filler filtering, but never `knownOnly`
 * or `epgVerifiedOnly` — the curated catalog and the EPG catalog both only
 * ever describe TV channels, so applying either here would empty the list
 * outright rather than narrow it.
 */
export function ensureRadioRows(force = false): void {
    const country = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const dropJunk = get<boolean>(SETTINGS_LIVE_DROP_JUNK) ?? true;
    const rows = getRows();

    // Keyed on the options alone, not on "did we get rows": a source with no
    // stations at all would otherwise re-scan every row on every navigation
    // into Radio, forever.
    const key = optionsKey(country, false, dropJunk, false, 0, rows.length);
    if (!force && key === radioBuiltFrom) return;

    const result = groupChannels(rows, {
        ...(country ? { country } : {}),
        dropJunk,
        radio: 'only',
    });
    radioGrouped = result.channels;
    radioRows = toDisplayRows(radioGrouped);
    radioBuiltFrom = key;
    // Only the count reaches state — enough for the Radio view to tell an
    // empty result from a list that simply hasn't been built yet.
    set(RADIO_COUNT, radioRows.length);
}

/** Pure core, split out so it can be exercised without touching state or module memory. */
export function buildLiveRows(
    rows: readonly ChannelRow[],
    country: string,
    knownOnly: boolean,
    dropJunk: boolean,
    epgMatches: ReadonlyMap<string, string> = new Map(),
    epgVerifiedOnly = false,
): GroupingResult {
    return groupChannels(rows, {
        // An empty country means "don't filter by country" — passing `''`
        // through would drop every row, since no prefix ever equals `''`.
        ...(country ? { country } : {}),
        knownOnly,
        dropJunk,
        radio: 'exclude',
        epgMatches,
        epgVerifiedOnly,
    });
}

function publishStats(result: GroupingResult, strictFellBack = false, epgFellBack = false): void {
    replace(LIVE_STATS, {
        inputRows: result.stats.inputRows,
        channels: result.stats.keptChannels,
        hiddenByCountry: result.stats.droppedByCountry,
        hiddenAsJunk: result.stats.droppedAsJunk,
        hiddenAsUnknown: result.stats.droppedAsUnknown,
        hiddenByEpg: result.stats.droppedByEpg,
        collapsed: result.stats.collapsedVariants,
        epgMatched: result.stats.epgMatched,
        strictFellBack,
        epgFellBack,
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
    set(RADIO_COUNT, 0);
}
