import type { XtreamResult } from '../xtream/client';
import type { XtreamCategory, XtreamSource } from '../xtream/types';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { createCatalogMemory, type CatalogMemory } from './catalog-memory';
import { loadStoredWarmMeta } from './catalog-storage';
import { commitWarmedCatalog, groupWarmedItems, rehydrateWarmedCatalog, WARM_ROW_CAP } from './catalog-warm';
import {
    createSweepAccumulator,
    SWEEP_PROGRESS_ZERO,
    sweepPrefix,
    withDerivedProgress,
    type SweepKind,
    type SweepProgress,
    type SweepSource,
} from './sweep-plan';
import { CATALOG_TTL_MS, isFresh } from './ttl';

/**
 * One catalog's sweep pool, parameterized — the engine `catalog-sweep.ts`
 * instantiates once for Movies and once for TV Shows. Split out only because
 * the two together exceed the 400-line module ceiling; `catalog-sweep.ts`'s
 * header is where the *why* of the whole feature lives.
 *
 * Everything about caching here is `catalog-warm.ts`'s existing machinery
 * (`loadStoredWarmMeta` → `rehydrateWarmedCatalog`, or fetch →
 * `groupWarmedItems` → `commitWarmedCatalog`), called once per source
 * against that source's own key prefix, rather than a second cache of its
 * own.
 */

/**
 * Spacing between sources. Xtream panels rate-limit and cap concurrent
 * connections per account, which is why nothing here runs in parallel; the
 * pause is for the *panel's* sake between two heavy dumps, so it is skipped
 * when a source came from cache and cost the network nothing.
 */
export const SWEEP_SOURCE_GAP_MS = 400;

/** Progress republish floor — the same 250 ms coalescing `downloads.actions.ts` uses, for the same reason (a bar cannot redraw faster, and every publish rebuilds the object). */
export const SWEEP_PUBLISH_INTERVAL_MS = 250;

export interface SweepCatalogConfig<TItem, TRaw, TDetail> {
    /** `'vod'`/`'series'` — the `catalog-storage.ts` key prefix, and `search.sweepKind`. */
    prefix: SweepKind;
    /** The active source's existing memory, so sweeping it is the warm the app already runs, not a second copy of it. */
    activeMemory: CatalogMemory<TItem, TDetail>;
    fetchCategories: (source: XtreamSource, signal: AbortSignal) => Promise<XtreamResult<XtreamCategory[]>>;
    fetchAll: (source: XtreamSource, signal: AbortSignal) => Promise<XtreamResult<TRaw[]>>;
    toItem: (raw: TRaw) => TItem;
    categoryIdOf: (item: TItem) => string;
    idOf: (item: TItem) => number;
}

export interface SweepRun {
    progress: SweepProgress;
    cancelled: boolean;
}

/** One swept item's provenance — the owner is what makes a foreign result playable through the normal detail/play path. */
export interface SweepOwnership {
    owner: SweepSource;
    /** That source's own name for the item's category (the active source's rail only knows its own). */
    categoryName: string | null;
}

/**
 * A swept item that belongs to a provider other than the active one, in the
 * shape `vod.actions.ts`/`series.actions.ts` need to treat it exactly like
 * one of their own: its owner's credentials (so the stream URL and the
 * detail fetch use the right account) and its own cache namespace (so a
 * foreign movie's `get_vod_info` never lands under the active source's
 * detail keys).
 */
export interface ForeignCatalogItem<TItem> {
    item: TItem;
    account: { sourceId: string; source: XtreamSource };
    categoryName: string | null;
    /** `catalog-storage.ts` key prefix for this owner — `sweepPrefix()`. */
    prefix: string;
}

export interface SweepPool<TItem> {
    items: () => readonly TItem[];
    multiSource: () => boolean;
    ownershipOf: (id: number, categoryId: string) => SweepOwnership | null;
    /** `null` when the pool never saw this id, or when its owner IS the active source (nothing about the normal path changes for those). */
    foreignItem: (id: number) => ForeignCatalogItem<TItem> | null;
    warmedAtOf: (sources: readonly SweepSource[]) => Promise<(number | null)[]>;
    run: (sources: readonly SweepSource[], onProgress: (progress: SweepProgress) => void) => Promise<SweepRun>;
    cancel: () => void;
    isRunning: () => boolean;
    reset: () => void;
}

export function createSweepPool<TItem, TRaw, TDetail>(config: SweepCatalogConfig<TItem, TRaw, TDetail>): SweepPool<TItem> {
    const memories = new Map<string, CatalogMemory<TItem, TDetail>>();
    const categoryNames = new Map<string, string>();
    const accumulator = createSweepAccumulator(config.idOf);
    let cancelController: AbortController | null = null;
    let running = false;

    function memoryFor(source: SweepSource): CatalogMemory<TItem, TDetail> {
        if (source.active) return config.activeMemory;
        let memory = memories.get(source.sourceKey);
        if (!memory) {
            memory = createCatalogMemory<TItem, TDetail>(config.idOf);
            memories.set(source.sourceKey, memory);
        }
        return memory;
    }

    /**
     * Folds one source's (now populated) memory into the shared union and
     * remembers its category names. Cleaned here (`cleanCatalogDisplayName()`)
     * because this map exists only to label rows — it is a display lookup,
     * the same role `vodCategoryName()` plays for the active source's rail,
     * not a second copy of catalog memory (which keeps raw names).
     */
    function absorb(source: SweepSource, memory: CatalogMemory<TItem, TDetail>): void {
        for (const category of memory.categories()) {
            categoryNames.set(`${source.sourceKey} ${category.id}`, cleanCatalogDisplayName(category.name));
        }
        accumulator.add(source, memory.allItems());
    }

    /** The network half, kept separate so the cache decisions above read as one branch. `false` = this source contributed nothing (a failed fetch, or a degenerate dump). */
    async function fetchSource(
        source: SweepSource,
        prefix: string,
        memory: CatalogMemory<TItem, TDetail>,
        signal: AbortSignal,
        now: number,
    ): Promise<boolean> {
        try {
            const categories = await config.fetchCategories(source.source, signal);
            if (!categories.ok) return false;

            const all = await config.fetchAll(source.source, signal);
            if (!all.ok) return false;
            // Same sanity decision as the background warm: a dump this large
            // reads as the provider quirk returning something degenerate, so
            // it is discarded whole rather than partially trusted.
            if (all.data.length > WARM_ROW_CAP) return false;

            const items = all.data.map(config.toItem);
            const byCategory = groupWarmedItems(
                items,
                categories.data.map((category) => category.id),
                config.categoryIdOf,
            );
            commitWarmedCatalog(prefix, memory, categories.data, byCategory, now);
            return true;
        } catch {
            // A caller-initiated abort *rejects* rather than resolving a
            // classified failure (`classified-fetch.ts`'s own comment), and
            // this is that caller. The run loop re-checks `signal.aborted`
            // straight after, so a cancel is reported as cancelled rather
            // than counted as a provider failure.
            return false;
        }
    }

    /**
     * One source: adopt a still-fresh cache if there is one, otherwise fetch
     * categories + the whole catalog and commit both through the existing
     * warm helpers. Reports whether it succeeded, how many categories it
     * covered, and whether it actually touched the network (which decides
     * whether the next source has to wait politely).
     */
    async function sweepSource(
        source: SweepSource,
        signal: AbortSignal,
    ): Promise<{ ok: boolean; categories: number; hitNetwork: boolean }> {
        const prefix = sweepPrefix(config.prefix, source);
        const memory = memoryFor(source);
        const now = Date.now();

        if (!isFresh(memory.warmedAt(), now, CATALOG_TTL_MS)) {
            const stored = await loadStoredWarmMeta(prefix);
            if (stored && isFresh(stored.fetchedAt, now, CATALOG_TTL_MS)) {
                // A previous session's sweep of this source is still fresh —
                // local reads only, exactly `catalog-warm.ts`'s rehydrate.
                await rehydrateWarmedCatalog(prefix, memory, stored.fetchedAt);
            } else if (await fetchSource(source, prefix, memory, signal, now)) {
                absorb(source, memory);
                return { ok: true, categories: memory.categories().length, hitNetwork: true };
            } else {
                return { ok: false, categories: 0, hitNetwork: true };
            }
        }

        absorb(source, memory);
        return { ok: true, categories: memory.categories().length, hitNetwork: false };
    }

    return {
        items: () => accumulator.items(),
        multiSource: () => accumulator.sourceCount() > 1,
        ownershipOf(id, categoryId) {
            const owner = accumulator.ownerOf(id);
            if (!owner) return null;
            return { owner, categoryName: categoryNames.get(`${owner.sourceKey} ${categoryId}`) ?? null };
        },

        foreignItem(id) {
            const owner = accumulator.ownerOf(id);
            if (!owner || owner.active) return null;
            const item = memories.get(owner.sourceKey)?.findItem(id);
            if (item === undefined) return null;
            return {
                item,
                account: { sourceId: owner.sourceId, source: owner.source },
                categoryName: categoryNames.get(`${owner.sourceKey} ${config.categoryIdOf(item)}`) ?? null,
                prefix: sweepPrefix(config.prefix, owner),
            };
        },

        /**
         * `warmedAt` per planned source, from module memory first (this
         * session's warm) and the persisted marker second (a previous
         * session's) — the same two-step freshness question
         * `createCatalogWarmer()` asks, asked for every source at once.
         */
        warmedAtOf: (sources) =>
            Promise.all(
                sources.map(async (source) => {
                    const inMemory = memoryFor(source).warmedAt();
                    if (inMemory !== null) return inMemory;
                    const stored = await loadStoredWarmMeta(sweepPrefix(config.prefix, source));
                    return stored?.fetchedAt ?? null;
                }),
            ),

        /**
         * Visits every source in order, committing each one's catalog as it
         * lands so a cancel keeps everything already fetched. `onProgress`
         * fires on every counter change — throttling is the caller's
         * (`search-sweep.actions.ts`), so this stays testable without timers.
         */
        async run(sources, onProgress) {
            accumulator.reset();
            running = true;
            const controller = new AbortController();
            cancelController = controller;

            let progress: SweepProgress = { ...SWEEP_PROGRESS_ZERO, sourcesTotal: sources.length };
            const report = (): void => {
                progress = withDerivedProgress(progress, controller.signal.aborted);
                onProgress(progress);
            };
            report();

            try {
                let previousHitNetwork = false;
                for (const source of sources) {
                    if (controller.signal.aborted) break;
                    if (previousHitNetwork) await delay(SWEEP_SOURCE_GAP_MS);
                    if (controller.signal.aborted) break;

                    progress = { ...progress, currentSource: source.name };
                    report();

                    const outcome = await sweepSource(source, controller.signal);
                    previousHitNetwork = outcome.hitNetwork;
                    if (controller.signal.aborted) break;

                    progress = {
                        ...progress,
                        sourcesDone: progress.sourcesDone + 1,
                        sourcesFailed: progress.sourcesFailed + (outcome.ok ? 0 : 1),
                        categories: progress.categories + outcome.categories,
                        items: accumulator.items().length,
                        currentSource: '',
                    };
                    report();
                }
            } finally {
                running = false;
                cancelController = null;
            }

            progress = { ...progress, currentSource: '', items: accumulator.items().length };
            report();
            return { progress, cancelled: controller.signal.aborted };
        },

        cancel: () => cancelController?.abort(),
        isRunning: () => running,
        reset() {
            memories.clear();
            categoryNames.clear();
            accumulator.reset();
            cancelController = null;
            running = false;
        },
    };
}
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
