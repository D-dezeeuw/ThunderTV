import { makeSourceKey } from '../core/connect/source-key';
import type { PlaylistRecord } from '../core/storage';
import type { XtreamSource } from '../xtream/types';
import { isHiddenSource } from './hidden-sources';
import { isFresh } from './ttl';

/**
 * The pure half of "search all" (`catalog-sweep.ts` is the impure half):
 * which sources a whole-catalog sweep has to visit, where each one's cache
 * lives, how the accumulated union is deduplicated, and how the progress
 * readout is accounted for. Everything here is a plain function over plain
 * data — no network, no storage, no Spektrum — because these are the parts
 * that are actually easy to get wrong and worth testing directly.
 */

/** `'vod'`/`'series'` rather than `'movies'`/`'series'` — the same two strings `catalog-storage.ts` already uses as its key prefix, so one name covers the catalog, its cache and `search.sweepKind`. */
export type SweepKind = 'vod' | 'series';

export interface SweepSource {
    /** The stored `PlaylistRecord.id` — re-minted by every re-import, so it is provenance, never a cache key. */
    sourceId: string;
    /** `makeSourceKey()` — stable across re-imports, which is what makes it safe as a storage-key component. */
    sourceKey: string;
    name: string;
    /** True for `playlist.activeSourceId`'s record — the one whose catalog the Movies/Series tabs already browse. */
    active: boolean;
    source: XtreamSource;
}

/**
 * Every configured, fully-credentialed Xtream source, active one first.
 *
 * Order is load-bearing rather than cosmetic: the active source is the one
 * whose catalog is most likely already warm (opening Movies warms it), and
 * it is the source every downstream click path already assumes, so it must
 * be the one that claims an item id before any other source can
 * (`createSweepAccumulator()`'s first-writer-wins rule).
 *
 * M3U sources are skipped — they have no VOD/series catalog to sweep at all.
 * So are hidden ones (`hidden-sources.ts`): a host kept out of the picker
 * for serving nothing playable should not cost the user a multi-minute
 * fetch either.
 */
export function collectSweepSources(
    records: readonly PlaylistRecord[],
    activeSourceId: string | null,
): SweepSource[] {
    const seen = new Set<string>();
    const sources: SweepSource[] = [];
    for (const record of records) {
        if (record.type !== 'xtream' || !record.url || !record.username || !record.password) continue;
        if (isHiddenSource({ url: record.url })) continue;
        const sourceKey = makeSourceKey('xtream', record.url, record.username);
        if (sourceKey === null || seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        sources.push({
            sourceId: record.id,
            sourceKey,
            name: record.name,
            active: record.id === activeSourceId,
            source: { url: record.url, user: record.username, pass: record.password },
        });
    }
    // Stable sort (ES2019+), so two inactive sources keep their stored order.
    return sources.sort((a, b) => Number(b.active) - Number(a.active));
}

/**
 * Where one source's swept catalog is cached.
 *
 * The active source reuses the plain `'vod'`/`'series'` prefix — the exact
 * keys `catalog-storage.ts` already writes for the browse path and the
 * background warm (`catalog-warm.ts`). That is the whole point: a user who
 * has opened Movies today has already paid for their own provider's dump,
 * and "search all" must not re-fetch it under a second key. Other sources
 * get their own suffixed namespace, since nothing else in the app caches
 * them at all.
 *
 * (The unsuffixed prefix following the *active* source rather than a fixed
 * one is pre-existing behaviour, not a decision taken here: `catalog-actions.ts`
 * has always stored whichever source is active under the bare prefix.)
 */
export function sweepPrefix(kind: string, source: SweepSource): string {
    return source.active ? kind : `${kind}@${source.sourceKey}`;
}

/**
 * True when every source in the plan is inside the warm TTL, i.e. the whole
 * sweep would be local reads. This is what decides whether "search all"
 * needs the "this takes a while" modal at all — on a warm cache it just
 * turns on, with no friction and nothing to confirm.
 *
 * An empty plan is *not* warm: there is nothing to search, and reporting
 * that honestly beats silently claiming full coverage.
 */
export function planIsWarm(warmedAt: readonly (number | null)[], now: number, ttlMs: number): boolean {
    return warmedAt.length > 0 && warmedAt.every((at) => isFresh(at, now, ttlMs));
}

export interface SweepAccumulator<TItem> {
    /** Adds one source's items, skipping ids an earlier source already claimed. Returns how many were skipped. */
    add: (source: SweepSource, items: readonly TItem[]) => number;
    items: () => readonly TItem[];
    ownerOf: (id: number) => SweepSource | undefined;
    /** How many distinct sources actually contributed at least one item — drives whether rows carry a provider label. */
    sourceCount: () => number;
    duplicates: () => number;
    reset: () => void;
}

/**
 * The cross-source union, deduplicated **by item id, first source wins**.
 *
 * Id dedup is a correctness requirement rather than a preference: a row's id
 * is `vod:<streamId>`/`series:<seriesId>` (`vod-rows.ts`/`series-rows.ts`),
 * so two entries sharing a stream id are indistinguishable to every click
 * path downstream — the detail panel, playback and the selection cursor
 * would all resolve to whichever one the owner index happened to hold. With
 * the active source added first, the copy that survives a collision is
 * always the one the rest of the app already knows about.
 *
 * **Same title from two providers is deliberately kept**, not collapsed:
 * those rows carry different ids, are individually playable, and one panel's
 * copy of a film routinely works when another's does not. They are told
 * apart by the provider label the search rows carry once more than one
 * source is in the pool — which is why `sourceCount()` exists.
 */
export function createSweepAccumulator<TItem>(idOf: (item: TItem) => number): SweepAccumulator<TItem> {
    let items: TItem[] = [];
    let owners = new Map<number, SweepSource>();
    let contributors = new Set<string>();
    let duplicates = 0;

    return {
        add(source, incoming) {
            let skipped = 0;
            for (const item of incoming) {
                const id = idOf(item);
                if (owners.has(id)) {
                    skipped++;
                    continue;
                }
                owners.set(id, source);
                items.push(item);
            }
            if (incoming.length > skipped) contributors.add(source.sourceKey);
            duplicates += skipped;
            return skipped;
        },
        items: () => items,
        ownerOf: (id) => owners.get(id),
        sourceCount: () => contributors.size,
        duplicates: () => duplicates,
        reset() {
            items = [];
            owners = new Map();
            contributors = new Set();
            duplicates = 0;
        },
    };
}

/**
 * The published progress readout. Every field is always written (never
 * optional, never omitted) — a `<progress :value>` bound to an absent path
 * assigns `undefined` to a numeric DOM property and throws, the exact
 * `data-if`-does-not-stop-bindings hazard `state/README.md` records.
 */
export interface SweepProgress {
    sourcesTotal: number;
    sourcesDone: number;
    sourcesFailed: number;
    /** Categories covered so far, summed across finished sources — the per-source detail the fetch loop naturally yields. */
    categories: number;
    /** Titles accumulated so far, after cross-source dedup. */
    items: number;
    /** The source currently being fetched, for the "where are we" line. Empty between sources and when finished. */
    currentSource: string;
    percent: number;
    /** True when the coverage on offer is known-incomplete: a source failed, or the sweep was cancelled part way. */
    partial: boolean;
}

export const SWEEP_PROGRESS_ZERO: SweepProgress = {
    sourcesTotal: 0,
    sourcesDone: 0,
    sourcesFailed: 0,
    categories: 0,
    items: 0,
    currentSource: '',
    percent: 0,
    partial: false,
};

/**
 * Recomputes the two derived fields off the counters the loop maintains, so
 * "how complete is this" is answered in exactly one place.
 *
 * `sourcesDone` counts *attempted* sources, failures included — a source
 * that failed is finished, it just contributed nothing — so the bar always
 * reaches 100% and honesty is carried by `partial`/`sourcesFailed` instead
 * of by a bar that mysteriously stops short.
 */
export function withDerivedProgress(progress: SweepProgress, cancelled: boolean): SweepProgress {
    const total = progress.sourcesTotal;
    return {
        ...progress,
        percent: total > 0 ? Math.round((progress.sourcesDone / total) * 100) : 0,
        partial: progress.sourcesFailed > 0 || cancelled || progress.sourcesDone < total,
    };
}
