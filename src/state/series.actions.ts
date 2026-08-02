import { defineFn } from 'spektrum';
import { getSeries, getSeriesCategories, getSeriesInfo } from '../xtream/client';
import { nextEpisode } from '../xtream/next-episode';
import type { XtreamSeries, XtreamSeriesInfo } from '../xtream/types';
import { seriesEpisodeUrl } from '../xtream/urls';
import { createCatalogActions, parseCatalogId, type CatalogActions } from './catalog-actions';
import { foreignSeriesItem } from './catalog-sweep';
import { refocusCategoryRow } from './groups.actions';
import { selectChannel } from './list.actions';
import { loadStoredDetail, saveStoredDetail } from './catalog-storage';
import { PLAYER_ACTIVE } from './player';
import { setActiveChannel } from './player.actions';
import type { ActiveChannelSnapshot } from './records';
import { createSequenceToken } from './sequence-token';
import {
    SERIES_ACTIVE_CATEGORY_ID,
    SERIES_CATEGORIES,
    SERIES_CATEGORIES_CAP,
    SERIES_COUNT,
    SERIES_DETAIL,
    SERIES_DETAIL_ERROR_REASON,
    SERIES_DETAIL_ID,
    SERIES_DETAIL_STATUS,
    SERIES_ERROR_REASON,
    SERIES_NEXT_PROMPT,
    SERIES_STALE,
    SERIES_STATUS,
    type NextEpisodePrompt,
    type SeriesItem,
} from './series';
import {
    cachedSeriesSource,
    makeSeriesEpisodeId,
    makeSeriesRowId,
    seriesCategoryName,
    seriesCategoryRail,
    seriesItemToRow,
    seriesMemory,
    setCachedSeriesSource,
    toSeriesDetail,
    toSeriesItem,
} from './series-rows';
import { CATALOG_TTL_MS, isFresh } from './ttl';
import { get, replace, set } from './typed';
import { resolveActiveXtreamSource, type ResolvedXtreamAccount } from './xtream-refresh';

/**
 * TV Shows (series) catalog actions (Phase 21).
 *
 * Browsing is `catalog-actions.ts`'s parameterized core (UPGRADES U10),
 * shared with Movies. What stays here is what genuinely differs: a series
 * is a container rather than something directly playable, and its detail is
 * a seasons/episodes tree with its own status key, its own error reason,
 * and a fetch shared with episode playback.
 *
 * Built on first use, never at module scope — same import-cycle reasoning
 * as `vod.actions.ts`'s.
 */
let catalog: CatalogActions | null = null;

function seriesCatalog(): CatalogActions {
    catalog ??= createCatalogActions<SeriesItem, XtreamSeries>({
        kind: 'series',
        keys: {
            status: SERIES_STATUS,
            errorReason: SERIES_ERROR_REASON,
            stale: SERIES_STALE,
            categories: SERIES_CATEGORIES,
            activeCategoryId: SERIES_ACTIVE_CATEGORY_ID,
            count: SERIES_COUNT,
        },
        categoriesCap: SERIES_CATEGORIES_CAP,
        rail: seriesCategoryRail,
        memory: seriesMemory,
        setCachedSource: setCachedSeriesSource,
        cachedSource: cachedSeriesSource,
        fetchCategories: (source) => getSeriesCategories(source),
        fetchItems: (source, categoryId) => getSeries(source, categoryId),
        toItem: toSeriesItem,
        categoryName: seriesCategoryName,
        // A series row's URL is built per episode, not per item, so the
        // source the shared core threads through is unused here.
        toRow: (item, _source, categoryName) => seriesItemToRow(item, categoryName),
    });
    return catalog;
}

export function openSeriesCatalog(): Promise<void> {
    return seriesCatalog().open();
}

export function selectSeriesCategory(categoryId: string): Promise<void> {
    return seriesCatalog().selectCategory(categoryId);
}

export function republishSeriesRows(): boolean {
    return seriesCatalog().republishRows();
}

function publishSeriesCategories(): void {
    seriesCatalog().publishCategories();
}

export function registerSeriesActions(): void {
    defineFn('series/open', () => {
        void openSeriesCatalog();
    });
    defineFn('series/selectCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (id) void selectSeriesCategory(id);
    });
    defineFn('series/toggleCategory', (el) => {
        const id = el.dataset['categoryId'];
        if (!id || !seriesCategoryRail.toggle(id)) return;
        publishSeriesCategories();
        // Same focus-survival reasoning as `vod/toggleCategory`.
        refocusCategoryRow(id);
    });
    defineFn('series/openDetail', (el) => {
        const id = parseCatalogId(el.dataset['seriesId']);
        if (id !== null) void openSeriesDetail(id);
    });
    defineFn('series/closeDetail', () => {
        closeSeriesDetail();
    });
    defineFn('series/playNext', () => {
        void playPromptedNextEpisode();
    });
    defineFn('series/dismissNext', () => {
        clearNextEpisodePrompt();
    });
    defineFn('series/playEpisode', (el) => {
        const seriesId = parseCatalogId(el.dataset['seriesId']);
        const episodeId = el.dataset['episodeId'];
        if (seriesId !== null && episodeId) void playSeriesEpisode(seriesId, episodeId);
    });
}

/** Same "why not just re-read the key" reasoning as `vod.actions.ts`'s token — see `sequence-token.ts`. */
const detailOpen = createSequenceToken();

/**
 * Feature 21.6.4 — an episode ended, so work out what follows and *offer* it.
 *
 * Called by `player/position.ts`'s `ended` handler, which owns the "when".
 * Everything about the "which" is `nextEpisode()`, kept pure and tested
 * separately; this function is the impure half — cache lookup, label, publish.
 *
 * Three deliberate properties:
 *
 * - **Nothing plays.** This only ever writes a prompt. Feature 21.6.6's
 *   `playback.autoAdvance` seam belongs in front of this call, not inside it,
 *   so "auto-advance" stays a decision someone made rather than a default.
 * - **Cache-only.** It reads `seriesMemory`, never the network: the season
 *   map was already fetched to start this episode, and an ended episode is a
 *   bad moment to block on a request that might fail. No cached info simply
 *   means no offer.
 * - **Silent when there is nothing to offer.** Feature 21.6.8 — at the end of
 *   a series the viewer returns quietly to the panel rather than being shown
 *   a prompt that says "nothing".
 */
export function showNextEpisodePrompt(current: { seriesId: number; season: number; episode: number }): void {
    const info = seriesMemory.detail(current.seriesId);
    if (!info) return;

    const next = nextEpisode(info, current);
    if (!next) return;

    const prompt: NextEpisodePrompt = {
        seriesId: current.seriesId,
        episodeId: next.episodeId,
        label: formatEpisodeLabel(next.season, next.episode, next.title),
    };
    replace(SERIES_NEXT_PROMPT, prompt);
}

export function clearNextEpisodePrompt(): void {
    replace(SERIES_NEXT_PROMPT, null);
}

/**
 * The `ended` bridge, called from `player/playback-state-sync.ts`.
 *
 * It lives here rather than in `player.actions.ts` to keep the module graph
 * acyclic: `series.actions` already imports `player.actions` for
 * `setActiveChannel()`, so the dependency has to run in this direction. The
 * player layer stays dumb — it reports *that* playback ended and knows
 * nothing about series — and every decision about what that means is here.
 *
 * Anything that is not a series episode ends with no offer, which is the
 * whole of Feature 21.4's "a movie just ends" behaviour.
 */
export function reportPlaybackEnded(): void {
    const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE);
    const series = active?.series;
    if (!series) return;
    showNextEpisodePrompt(series);
}

/** Consumes the standing offer. Clearing *before* playing matters: `playSeriesEpisode()` awaits a source resolve, and leaving the old prompt on screen across that await reads as "the click did nothing." */
async function playPromptedNextEpisode(): Promise<void> {
    const prompt = get<NextEpisodePrompt | null>(SERIES_NEXT_PROMPT);
    if (!prompt) return;
    clearNextEpisodePrompt();
    await playSeriesEpisode(prompt.seriesId, prompt.episodeId);
}

/** "S02E01 — Pilot", zero-padded to two digits, with the dash dropped when the provider gave no title. Formatting lives here rather than in the template so the markup binds one string (masterplan §7: no logic in `{{ }}`). */
function formatEpisodeLabel(season: number, episode: number, title: string): string {
    const code = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    return title ? `${code} — ${title}` : code;
}

/**
 * Same partial-then-filled publish + `replace()` reasoning as
 * `vod.actions.ts`'s `openVodDetail()`, plus `series.detailStatus`/
 * `series.detailErrorReason` (`series.ts`'s doc) — every early return below
 * leaves the panel visibly `'error'`/`'no-source'` or `'fetch-failed'`,
 * never silently stuck on `'loading'`. A failure with a stale cached `info`
 * to fall back on still reports `'ready'` (stale beats alarming).
 */
export async function openSeriesDetail(seriesId: number): Promise<void> {
    // Same "a search-all result may belong to another provider" contract as
    // `vod.actions.ts`'s `openVodDetail()` — see its comment.
    const foreign = foreignSeriesItem(seriesId);
    const item = seriesMemory.findItem(seriesId) ?? foreign?.item;
    if (!item) return;

    const token = detailOpen.begin();
    set(SERIES_DETAIL_ID, seriesId);
    set(SERIES_DETAIL_STATUS, 'loading');
    set(SERIES_DETAIL_ERROR_REASON, null);
    const categoryName = foreign?.categoryName ?? seriesCategoryName(item.categoryId);
    replace(SERIES_DETAIL, toSeriesDetail(item, categoryName));

    const account = foreign?.account ?? (await resolveActiveXtreamSource());
    if (!account) {
        if (!detailOpen.isCurrent(token)) return;
        set(SERIES_DETAIL_STATUS, 'error');
        set(SERIES_DETAIL_ERROR_REASON, 'no-source');
        return;
    }
    if (!foreign) setCachedSeriesSource(account.source);

    const { info, failed } = await fetchSeriesInfo(seriesId, account, foreign?.prefix ?? 'series');
    if (!detailOpen.isCurrent(token)) return; // superseded — the user moved on

    if (failed && !info) {
        set(SERIES_DETAIL_STATUS, 'error');
        set(SERIES_DETAIL_ERROR_REASON, 'fetch-failed');
        return;
    }

    set(SERIES_DETAIL_STATUS, 'ready');
    if (info) replace(SERIES_DETAIL, toSeriesDetail(item, categoryName, info));
}

export function closeSeriesDetail(): void {
    set(SERIES_DETAIL_ID, null);
    set(SERIES_DETAIL_STATUS, 'idle');
    set(SERIES_DETAIL_ERROR_REASON, null);
    replace(SERIES_DETAIL, null);
}

/** One `fetchSeriesInfo()` outcome — `failed` is true only when the network call itself failed; a cache hit (fresh or the stale-but-still-returned fallback) is never a failure, even though `info` can legitimately be `undefined` in both cases. */
interface SeriesInfoFetch {
    info: XtreamSeriesInfo | undefined;
    failed: boolean;
}

/** Module-memory cache first, then the full-tier storage cache, then the network — shared by `openSeriesDetail()` and `playSeriesEpisode()` (an episode needs the season/episode list too, to find its `containerExtension`). `account` is always already-resolved non-null (both call sites resolve it themselves first); `prefix` is its storage namespace, `'series'` for the active source and its own for a search-all result from another provider. */
async function fetchSeriesInfo(
    seriesId: number,
    account: Pick<ResolvedXtreamAccount, 'source'>,
    prefix: string,
): Promise<SeriesInfoFetch> {
    const now = Date.now();

    let info = seriesMemory.detail(seriesId);
    if (!info || !isFresh(seriesMemory.detailFetchedAt(seriesId), now, CATALOG_TTL_MS)) {
        const stored = await loadStoredDetail<XtreamSeriesInfo>(prefix, seriesId);
        // No freshness gate — a season/episode list is exactly what an
        // offline viewer needs to still see, and a show that gained an
        // episode yesterday is a much smaller problem than a panel that
        // shows none at all.
        if (stored) {
            seriesMemory.setDetail(seriesId, stored.data, stored.fetchedAt);
            info = stored.data;
        }
    }
    if (!isFresh(seriesMemory.detailFetchedAt(seriesId), now, CATALOG_TTL_MS)) {
        const result = await getSeriesInfo(account.source, seriesId);
        // `failed` only when there is nothing to fall back on: with a stale
        // cache in hand the panel reports ready (stale beats alarming, which
        // is this function's existing contract for a failed refresh).
        if (!result.ok) return { info, failed: info === undefined };
        info = result.data;
        seriesMemory.setDetail(seriesId, info, now);
        void saveStoredDetail(prefix, seriesId, { fetchedAt: now, data: info });
    }
    return { info, failed: false };
}

/**
 * Finds the episode inside the (TTL-cached) `get_series_info` payload,
 * builds its stream URL, and hands off through `setActiveChannel()` — same
 * "reuse the existing player action path" decision as `vod.actions.ts`'s
 * `playVod()`. The played row's name is the episode title alone (falling
 * back to the series name if the provider sent no title) — deliberately
 * not a synthesized "S1E2" label, which would be UI-copy-shaped formatting
 * this state-layer module has no business inventing.
 */
export async function playSeriesEpisode(seriesId: number, episodeId: number | string): Promise<void> {
    const foreign = foreignSeriesItem(seriesId);
    const item = seriesMemory.findItem(seriesId) ?? foreign?.item;
    if (!item) return;
    const account = foreign?.account ?? (await resolveActiveXtreamSource());
    if (!account) return;
    if (!foreign) setCachedSeriesSource(account.source);

    const { info } = await fetchSeriesInfo(seriesId, account, foreign?.prefix ?? 'series');
    const episode = (info ?? []).flatMap((season) => season.episodes).find((ep) => String(ep.episodeId) === String(episodeId));
    if (!episode) return;

    const url = seriesEpisodeUrl(account.source, episode.episodeId, episode.containerExtension);
    setActiveChannel({
        id: makeSeriesEpisodeId(seriesId, episode.episodeId),
        sourceId: account.sourceId,
        name: episode.title || item.name,
        streamUrl: url,
        logo: item.cover ?? null,
        group: foreign?.categoryName ?? seriesCategoryName(item.categoryId),
        kind: 'series',
        series: { seriesId, season: episode.season, episode: episode.episode },
    });
    selectChannel(makeSeriesRowId(seriesId));
    // Same reason as `playVod()`: the detail panel covers the list body,
    // player pane included.
    closeSeriesDetail();
}
