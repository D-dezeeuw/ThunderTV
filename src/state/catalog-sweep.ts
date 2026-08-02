import { getPlatform } from '../core/platform';
import { getSeries, getSeriesCategories, getVodCategories, getVodStreams } from '../xtream/client';
import type { XtreamSeries, XtreamSeriesInfo, XtreamVodInfo, XtreamVodStream } from '../xtream/types';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import type { SeriesItem } from './series';
import { seriesMemory, toSeriesItem } from './series-rows';
import {
    createSweepPool,
    SWEEP_PUBLISH_INTERVAL_MS,
    type ForeignCatalogItem,
    type SweepOwnership,
    type SweepPool,
    type SweepRun,
} from './sweep-pool';
import { collectSweepSources, planIsWarm, type SweepKind, type SweepProgress, type SweepSource } from './sweep-plan';
import { CATALOG_TTL_MS } from './ttl';
import { get } from './typed';
import type { VodItem } from './vod';
import { toVodItem, vodMemory } from './vod-rows';

export { SWEEP_PUBLISH_INTERVAL_MS };
export type { ForeignCatalogItem, SweepOwnership, SweepRun };

/**
 * "Search all" — the whole-catalog sweep behind the Movies/TV Shows search
 * box, and the cross-source pool it fills.
 *
 * ## What was already cached, and what this adds
 *
 * A single provider's catalog was already covered: `catalog-warm.ts`'s
 * background warm pulls the ENTIRE VOD/series catalog of the **active**
 * Xtream account in one request (the documented "omit `category_id`" quirk)
 * and caches it for 24h, so searching *every category* of that provider has
 * been a cache read since Phase 21. What no cache covered was every *other*
 * configured provider — the Movies/TV Shows tabs only ever show the active
 * one.
 *
 * So this is not a second cache: it is the same fetch, the same
 * `catalog-storage.ts` keys, the same 24h TTL and the same
 * rehydrate-from-storage path, run once per configured source. The active
 * source keeps the bare `'vod'`/`'series'` prefix, which means a user who
 * has opened Movies today has already paid for the expensive half and the
 * sweep skips straight past it (`sweepPrefix()`).
 *
 * ## Consequences worth knowing
 *
 * - **Warm cache → no modal.** `isSweepWarm()` answers "is every source
 *   inside its TTL" with local reads only, so the common case turns search-
 *   all on instantly and the warning modal only appears when there really
 *   is a multi-minute fetch to consent to.
 * - **Cancellable mid-request.** Every fetch carries an `AbortSignal` — the
 *   only caller in the app that passes one, see `client.ts`'s `callApi()` —
 *   so Cancel takes effect during a 40 MB dump rather than after it. Sources
 *   already committed stay committed, in memory and in storage.
 * - **Failures are counted, never hidden.** A source that fails still
 *   counts as `sourcesDone` (it is finished, it just contributed nothing)
 *   and raises `sourcesFailed`/`partial`, which the modal and the results
 *   hint both report. A partial sweep is never presented as complete.
 * - **Persistence is full-tier only.** `catalog-storage.ts` refuses to write
 *   a multi-thousand-item catalog into `localStorage`, so on
 *   `'partial'`/`'none'` the sweep still works but nothing survives the
 *   session — the existing warm's contract, inherited rather than
 *   re-decided.
 */

/**
 * Both pools are built on first use, never at module scope — the same
 * import-cycle rule `vod.actions.ts` records: this module is reachable from
 * `search.actions.ts`, whose own graph loops back here through
 * `catalog-warm.ts`, and a factory call during evaluation would read
 * whichever singleton happened to still be in its temporal dead zone.
 */
let vodPool: SweepPool<VodItem> | null = null;
let seriesPool: SweepPool<SeriesItem> | null = null;

function vodSweepPool(): SweepPool<VodItem> {
    vodPool ??= createSweepPool<VodItem, XtreamVodStream, XtreamVodInfo>({
        prefix: 'vod',
        activeMemory: vodMemory,
        fetchCategories: (source, signal) => getVodCategories(source, signal),
        fetchAll: (source, signal) => getVodStreams(source, undefined, signal),
        toItem: toVodItem,
        categoryIdOf: (item) => item.categoryId,
        idOf: (item) => item.streamId,
    });
    return vodPool;
}

function seriesSweepPool(): SweepPool<SeriesItem> {
    seriesPool ??= createSweepPool<SeriesItem, XtreamSeries, XtreamSeriesInfo>({
        prefix: 'series',
        activeMemory: seriesMemory,
        fetchCategories: (source, signal) => getSeriesCategories(source, signal),
        fetchAll: (source, signal) => getSeries(source, undefined, signal),
        toItem: toSeriesItem,
        categoryIdOf: (item) => item.categoryId,
        idOf: (item) => item.seriesId,
    });
    return seriesPool;
}

function poolFor(kind: SweepKind): SweepPool<VodItem> | SweepPool<SeriesItem> {
    return kind === 'vod' ? vodSweepPool() : seriesSweepPool();
}

/** Every configured, sweepable Xtream source — the active one first (`collectSweepSources()`). */
export async function sweepSources(): Promise<SweepSource[]> {
    const records = await getPlatform().storage.getAll('playlists');
    return collectSweepSources(records, get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) ?? null);
}

/**
 * Whether "search all" can be turned on with no fetching at all. Local
 * reads only (module memory + the persisted warm markers), so asking is
 * cheap enough to do on every press of the affordance.
 */
export async function isSweepWarm(kind: SweepKind, sources: readonly SweepSource[]): Promise<boolean> {
    const warmedAt = await poolFor(kind).warmedAtOf(sources);
    return planIsWarm(warmedAt, Date.now(), CATALOG_TTL_MS);
}

export function runSweep(
    kind: SweepKind,
    sources: readonly SweepSource[],
    onProgress: (progress: SweepProgress) => void,
): Promise<SweepRun> {
    return poolFor(kind).run(sources, onProgress);
}

export function cancelSweep(kind: SweepKind): void {
    poolFor(kind).cancel();
}

export function isSweepRunning(kind: SweepKind): boolean {
    return poolFor(kind).isRunning();
}

export function sweptVodItems(): readonly VodItem[] {
    return vodSweepPool().items();
}

export function sweptSeriesItems(): readonly SeriesItem[] {
    return seriesSweepPool().items();
}

/** Which source a swept movie came from, plus that source's own name for its category — `null` for anything the pool has never seen. */
export function sweptVodOwnership(streamId: number, categoryId: string): SweepOwnership | null {
    return vodSweepPool().ownershipOf(streamId, categoryId);
}

export function sweptSeriesOwnership(seriesId: number, categoryId: string): SweepOwnership | null {
    return seriesSweepPool().ownershipOf(seriesId, categoryId);
}

/** A movie the sweep found on a provider other than the active one — see `ForeignCatalogItem`. `null` for everything else, which is what keeps the single-source path byte-for-byte what it was. */
export function foreignVodItem(streamId: number): ForeignCatalogItem<VodItem> | null {
    return vodSweepPool().foreignItem(streamId);
}

export function foreignSeriesItem(seriesId: number): ForeignCatalogItem<SeriesItem> | null {
    return seriesSweepPool().foreignItem(seriesId);
}

/** True when the pool holds items from more than one provider — the condition for labelling result rows with where they came from. */
export function sweptMultiSource(kind: SweepKind): boolean {
    return poolFor(kind).multiSource();
}


/** Test-only: drops both pools' accumulated union, per-source memories and owner index. @internal */
export function resetSweepForTests(): void {
    vodPool?.reset();
    seriesPool?.reset();
}
