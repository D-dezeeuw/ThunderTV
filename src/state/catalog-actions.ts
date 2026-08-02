import { getPlatform, hasPlatform } from '../core/platform';
import { markApplies, noAudioMark } from '../player/no-audio-marks';
import { setDisplayedRows } from './list-rows';
import { loadStoredCategories, loadStoredItems, saveStoredCategories, saveStoredItems } from './catalog-storage';
import type { CategoryRail, CategoryRailRow } from './catalog-category-tree';
import type { CatalogMemory } from './catalog-memory';
import { createSequenceToken } from './sequence-token';
import { SETTINGS_HIDE_NO_AUDIO_TITLES, SETTINGS_LIVE_COUNTRY } from './settings';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, set } from './typed';
import type { ChannelRow } from '../m3u/types';
import type { XtreamResult } from '../xtream/client';
import type { XtreamCategory, XtreamSource } from '../xtream/types';
import { resolveActiveXtreamSource } from './xtream-refresh';

/**
 * The browse half of a catalog, parameterized (UPGRADES U10).
 *
 * Movies and TV Shows browse identically — resolve the account, take
 * categories from module memory, then the storage cache, then the network;
 * adopt a stale cache rather than showing an error; auto-select the first
 * (country-sorted) category; then do the same three-tier dance for that
 * category's items and publish them into the one shared virtual list. The
 * two copies of that had drifted into 700-odd lines whose comments pointed
 * at each other ("see `vod.actions.ts`'s identical branch"), which is a
 * standing invitation to fix a bug in one and not the other.
 *
 * `catalog-memory.ts`, `catalog-category-tree.ts`, `catalog-storage.ts`,
 * `catalog-warm.ts` and `catalog-sort.ts` already worked this way; this is
 * the same treatment applied to the actions that drive them.
 *
 * **Deliberately not included: detail and playback.** VOD detail is one
 * flat `get_vod_info` snapshot; a series' is a seasons/episodes tree with
 * its own status key, its own error reason, and a fetch shared with
 * episode playback. Those differences are the product, not an accident, and
 * forcing them through one shape would cost more in config than it saved in
 * lines. They stay in `vod.actions.ts`/`series.actions.ts`.
 */

/**
 * Only the category/item half of `CatalogMemory`. The browse core never
 * touches the per-item detail cache, so it does not name that type — which
 * also means a catalog can hand over its memory whatever its detail shape
 * is, without threading a type parameter through for something unused.
 */
export type CatalogBrowseMemory<TItem> = Pick<
    CatalogMemory<TItem, unknown>,
    | 'categories'
    | 'setCategories'
    | 'categoriesFetchedAt'
    | 'setCategoriesFetchedAt'
    | 'itemsFor'
    | 'itemsFetchedAt'
    | 'setItemsFor'
>;

export interface CatalogActionsConfig<TItem, TRaw> {
    /** Storage-key prefix — `'vod'` or `'series'` (`catalog-storage.ts`). */
    kind: string;
    keys: {
        status: string;
        errorReason: string;
        stale: string;
        categories: string;
        activeCategoryId: string;
        count: string;
    };
    categoriesCap: number;
    rail: CategoryRail;
    memory: CatalogBrowseMemory<TItem>;
    setCachedSource: (source: XtreamSource) => void;
    cachedSource: () => XtreamSource | null;
    fetchCategories: (source: XtreamSource) => Promise<XtreamResult<XtreamCategory[]>>;
    fetchItems: (source: XtreamSource, categoryId: string) => Promise<XtreamResult<TRaw[]>>;
    toItem: (raw: TRaw) => TItem;
    categoryName: (categoryId: string) => string | null;
    /** Series ignores `source` — its row URL is built per episode, not per item. */
    toRow: (item: TItem, source: XtreamSource | null, categoryName: string | null) => ChannelRow;
}

export interface CatalogActions {
    open: () => Promise<void>;
    /** The accordion's visible rows. Returned as well as published so `open()` can take the first without re-reading the key it just wrote. */
    publishCategories: () => CategoryRailRow[];
    selectCategory: (categoryId: string) => Promise<void>;
    /** @returns false when there is nothing cached to publish, so the caller can fall back to `open()`. */
    republishRows: () => boolean;
}

/**
 * Drops titles this device has already proved come out silent, when the
 * viewer asked for that (`settings.hideNoAudioTitles`, off by default —
 * `src/player/no-audio-marks.ts` holds the evidence and the per-platform
 * matching rule). Row ids are the ids marks are filed under, so this costs
 * one map lookup per row and no lookup at all while the setting is off.
 */
function withoutSilentTitles(rows: ChannelRow[]): ChannelRow[] {
    if (get<boolean>(SETTINGS_HIDE_NO_AUDIO_TITLES) !== true) return rows;
    const canTranscode = hasPlatform() && Boolean(getPlatform().audioTranscode);
    return rows.filter((row) => !markApplies(noAudioMark(row.id), canTranscode));
}

/** Both catalogs read their id off a `data-*` attribute, so both need the same "is this a real number" check before using it. */
export function parseCatalogId(raw: string | undefined): number | null {
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
}

export function createCatalogActions<TItem, TRaw>(config: CatalogActionsConfig<TItem, TRaw>): CatalogActions {
    const { keys, rail, memory } = config;

    // Per-catalog rather than module-scope: two instances of this factory
    // must not share an in-flight guard, and the old module-level `let`s
    // were one of the singletons AUDIT §4.4 counted.
    let openInFlight = false;
    const categorySelection = createSequenceToken();

    function publishCategories(): CategoryRailRow[] {
        const rows = rail.rows();
        set(keys.categories, rows);
        return rows;
    }

    function fail(reason: 'no-source' | 'fetch-failed'): void {
        set(keys.status, 'error');
        set(keys.errorReason, reason);
    }

    /**
     * Resolves the active Xtream source, fetches (or reuses a fresh cache
     * of) the category list, sorts it country-first, and auto-selects the
     * first one — which is the first *country-matching* category whenever
     * one exists, since the sort already put it there (`catalog-sort.ts`).
     *
     * **Decision:** no "All" pseudo-category. It would need one very large,
     * unfiltered stream call on every open; a real category is already the
     * cheaper, always-relevant first stop.
     */
    async function open(): Promise<void> {
        if (openInFlight) return;
        openInFlight = true;
        set(keys.status, 'loading');
        set(keys.errorReason, null);
        try {
            const account = await resolveActiveXtreamSource();
            if (!account) {
                fail('no-source');
                return;
            }
            config.setCachedSource(account.source);

            const now = Date.now();
            let categories = memory.categories();
            let fetchedAt = memory.categoriesFetchedAt();

            if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
                const stored = await loadStoredCategories(config.kind);
                // Adopted even past its TTL, which is what makes offline
                // browsing work at all: the freshness check below still
                // decides whether to go and refresh, but if that fails
                // there is now something real to fall back to.
                if (stored && (categories.length === 0 || stored.fetchedAt > (fetchedAt ?? 0))) {
                    memory.setCategories(stored.categories);
                    memory.setCategoriesFetchedAt(stored.fetchedAt);
                    categories = stored.categories;
                    fetchedAt = stored.fetchedAt;
                }
            }

            if (!isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
                const result = await config.fetchCategories(account.source);
                if (result.ok) {
                    categories = result.data;
                    fetchedAt = now;
                    memory.setCategories(categories);
                    memory.setCategoriesFetchedAt(fetchedAt);
                    void saveStoredCategories(config.kind, { fetchedAt, categories });
                    set(keys.stale, false);
                } else if (categories.length > 0) {
                    // Offline, or the panel is down, with a cache in hand:
                    // yesterday's catalog beats an error screen. Flagged
                    // rather than passed off as live.
                    set(keys.stale, true);
                } else {
                    fail('fetch-failed');
                    return;
                }
            } else {
                set(keys.stale, false);
            }

            rail.setCategories(categories, get<string>(SETTINGS_LIVE_COUNTRY) ?? '', config.categoriesCap);
            const rows = publishCategories();

            const first = rows[0];
            if (first) {
                await selectCategory(first.id);
            } else {
                set(keys.status, 'ready');
            }
        } finally {
            openInFlight = false;
        }
    }

    /** Lazily fetches (or reuses a fresh cache of) one category's items, then publishes them through the shared virtual-list pipeline — see `README.md`'s row-publication table. */
    async function selectCategory(categoryId: string): Promise<void> {
        const token = categorySelection.begin();
        set(keys.activeCategoryId, categoryId);
        set(keys.status, 'loading');
        // A variant reached from anywhere but its own rail row (a restored
        // selection, a search result) would otherwise sit selected inside a
        // collapsed group, with nothing on screen showing what is open.
        if (rail.reveal(categoryId)) publishCategories();

        const account = await resolveActiveXtreamSource();
        if (!account) {
            fail('no-source');
            return;
        }
        config.setCachedSource(account.source);

        const now = Date.now();
        let items = memory.itemsFor(categoryId);
        let fetchedAt = memory.itemsFetchedAt(categoryId);

        if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const stored = await loadStoredItems<TItem>(config.kind, categoryId);
            // Stale-but-present beats absent — same reasoning as the
            // category list above; this is what a category opened yesterday
            // shows today with no connection.
            if (stored && (!items || stored.fetchedAt > (fetchedAt ?? 0))) {
                memory.setItemsFor(categoryId, stored.items, stored.fetchedAt);
                items = stored.items;
                fetchedAt = stored.fetchedAt;
            }
        }

        if (!items || !isFresh(fetchedAt, now, CATALOG_TTL_MS)) {
            const result = await config.fetchItems(account.source, categoryId);
            if (result.ok) {
                items = result.data.map(config.toItem);
                fetchedAt = now;
                memory.setItemsFor(categoryId, items, fetchedAt);
                void saveStoredItems(config.kind, categoryId, { items, fetchedAt });
                set(keys.stale, false);
            } else if (!items) {
                fail('fetch-failed');
                return;
            } else {
                set(keys.stale, true);
            }
        }

        // Unreachable in practice (the fetch branch above always either
        // returns on failure or assigns a real array) — kept as an explicit
        // guard so `items` below is provably defined rather than relying on
        // TS to prove it across the two conditional reassignments.
        if (!items) {
            fail('fetch-failed');
            return;
        }

        // A rapid second selectCategory call could race this one — bail
        // without publishing stale rows if a newer call started meanwhile.
        if (!categorySelection.isCurrent(token)) return;

        set(keys.errorReason, null);
        set(keys.count, items.length);
        set(keys.status, 'ready');
        const categoryName = config.categoryName(categoryId);
        setDisplayedRows(withoutSilentTitles(items.map((item) => config.toRow(item, account.source, categoryName))));
    }

    /**
     * Republishes the already-selected category's rows into the shared
     * virtual list, from module memory, with no fetch and no auto-select.
     *
     * This exists because the list is *shared*: Live, Categories, Movies,
     * Series and Search all publish into one row surface, so whichever view
     * you switch INTO has to (re)publish, or the previous view's rows simply
     * stay on screen. `open()` cannot be that call — it re-runs
     * "auto-select the first category" every time, which would throw away a
     * viewer's drill-down on every tab switch.
     */
    function republishRows(): boolean {
        const categoryId = get<string | null>(keys.activeCategoryId);
        if (!categoryId) return false;
        const items = memory.itemsFor(categoryId);
        if (!items) return false;
        const categoryName = config.categoryName(categoryId);
        setDisplayedRows(withoutSilentTitles(items.map((item) => config.toRow(item, config.cachedSource(), categoryName))));
        set(keys.count, items.length);
        set(keys.status, 'ready');
        return true;
    }

    return { open, publishCategories, selectCategory, republishRows };
}
