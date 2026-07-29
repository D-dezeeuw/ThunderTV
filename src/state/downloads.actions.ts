import { defineFn } from 'spektrum';
import { applyProxy } from '../core/http/proxy';
import type { DownloadHandle, DownloadTarget } from '../core/platform/download-adapter';
import { safeFilename } from '../core/platform/download-adapter';
import { effectiveProxyTemplate } from '../core/platform/electron-platform';
import { getPlatform } from '../core/platform';
import {
    DOWNLOAD_QUEUE_CAP,
    DOWNLOADS_ACTIVE_ID,
    DOWNLOADS_ITEMS,
    formatSizeLabel,
    isDownloadBusy,
    episodeBaseName,
    percentOf,
    seriesDownloadId,
    vodDownloadId,
    type DownloadEntry,
    type DownloadErrorReason,
} from './downloads';
import { get, set } from './typed';
import { cachedVodSource, vodCategoryName, vodItemToRow, vodMemory } from './vod-rows';
import { resolveActiveXtreamSource } from './xtream-refresh';
import { VOD_DETAIL, type VodDetail } from './vod';
import { SERIES_DETAIL, type SeriesDetail } from './series';
import { cachedSeriesSource } from './series-rows';
import { seriesEpisodeUrl } from '../xtream/urls';

/**
 * The download queue: one transfer at a time, in the order the viewer asked.
 *
 * Serial on purpose, not as a simplification. Xtream panels cap concurrent
 * connections per account — the same limit that makes "downloading while
 * watching" fail — so several parallel transfers would trade a queue that
 * finishes for a set of transfers that all die at once. One at a time also
 * leaves room for the *watching* connection alongside it.
 *
 * ## Why the queue lives in module memory, not in Spektrum state
 *
 * `set()` only *queues* a write: nothing is visible to `get()` until the
 * next `tick()`, and nothing guarantees a tick lands between an enqueue and
 * the `pumpQueue()` call right after it (production drains on `run()`'s rAF
 * loop). A runner that re-read its own just-written state would therefore
 * see an empty queue and never start — the exact hazard `sequence-token.ts`
 * documents for the catalog actions.
 *
 * So `queue`/`activeId` below are the source of truth, and `publish()`
 * mirrors them into `downloads.items`/`downloads.activeId` for rendering.
 * That also keeps the live `DownloadHandle` — a function-bearing object —
 * out of a store that should only ever hold serializable snapshots.
 */
const queue: DownloadEntry[] = [];
let activeId: string | null = null;
let activeHandle: DownloadHandle | null = null;
/** Progress-write cadence — see `runNext()`'s `onProgress`. Matches the desktop side's own coalescing (`desktop/main.mjs`). */
const PROGRESS_INTERVAL_MS = 250;
/** Destinations chosen at click time (the save picker needs the click's user activation — see `download-adapter.ts`), consumed when the runner reaches that entry. */
const targets = new Map<string, DownloadTarget>();
/** Stream URLs, same lifetime as `targets`. Deliberately not in state: a VOD URL carries the account's username and password in its path. */
const urls = new Map<string, string>();

export function registerDownloadActions(): void {
    defineFn('downloads/startVod', (el) => {
        const id = Number(el.dataset['streamId']);
        if (Number.isFinite(id)) void startVodDownload(id);
    });
    defineFn('downloads/startSeriesEpisode', (el) => {
        const seriesId = Number(el.dataset['seriesId']);
        const episodeId = el.dataset['episodeId'];
        if (Number.isFinite(seriesId) && episodeId) void startSeriesEpisodeDownload(seriesId, episodeId);
    });
    defineFn('downloads/cancel', (el) => {
        const id = el.dataset['downloadId'];
        if (id) cancelDownload(id);
    });
    defineFn('downloads/dismiss', (el) => {
        const id = el.dataset['downloadId'];
        if (id) dismissDownload(id);
    });
    defineFn('downloads/clearFinished', () => {
        clearFinishedDownloads();
    });
}

/**
 * Mirrors the module-memory queue into state. A fresh array of fresh
 * objects every time: Spektrum diffs by reference, and mutating an entry in
 * place would leave the DOM bound to a value that never looks changed.
 */
function publish(): void {
    set(
        DOWNLOADS_ITEMS,
        queue.map((entry) => ({ ...entry })),
    );
    set(DOWNLOADS_ACTIVE_ID, activeId);
}

function find(id: string): DownloadEntry | undefined {
    return queue.find((entry) => entry.id === id);
}

function patch(id: string, changes: Partial<DownloadEntry>): void {
    const entry = find(id);
    if (!entry) return;
    Object.assign(entry, changes);
    publish();
}

/**
 * The shared half of queueing anything. Split from the two callers because
 * the *order* here is load-bearing and must not be re-derived per caller:
 * the save destination is chosen inside the click, since the web save
 * picker needs transient user activation and the runner may not reach this
 * entry for minutes (`download-adapter.ts`).
 *
 * `resolveUrl` therefore runs *after* the picker, and each caller must have
 * computed its own `name`/`filename` synchronously before calling in — from
 * state and module memory the open detail panel already populated, so no
 * `await` can spend the activation before the picker opens.
 */
async function enqueue(
    id: string,
    name: string,
    filename: string,
    resolveUrl: () => Promise<string | null>,
): Promise<void> {
    // Asking twice is a double-click, not a request for a second copy.
    if (isDownloadBusy(find(id)?.status ?? 'done')) return;
    if (queue.filter((entry) => isDownloadBusy(entry.status)).length >= DOWNLOAD_QUEUE_CAP) return;

    // First await, on purpose. See this function's doc.
    const target = await getPlatform().downloads.prepare(filename);
    // `null` is the viewer dismissing the picker — an ordinary "never mind",
    // so nothing is queued and nothing is reported.
    if (!target) return;

    const url = await resolveUrl();
    const entry: DownloadEntry = {
        id,
        name,
        filename: target.filename,
        status: url ? 'queued' : 'error',
        percent: -1,
        sizeLabel: '',
        errorReason: url ? null : 'network',
    };
    // Replaces any finished entry for the same title, so re-downloading one
    // reuses its row instead of stacking a second below it.
    const existing = queue.findIndex((candidate) => candidate.id === id);
    if (existing >= 0) queue.splice(existing, 1, entry);
    else queue.push(entry);

    if (url) {
        targets.set(id, target);
        // The proxy is not optional: it is what makes the URL same-origin
        // (the `download` attribute is ignored cross-origin) and, on the
        // desktop, what makes the request leave from this machine's own IP —
        // the same reasoning as `src/player/bindings.ts`'s attach.
        urls.set(id, applyProxy(effectiveProxyTemplate(), url));
    }
    publish();
    pumpQueue();
}

/** Queues a movie. Title and extension come from the catalog item the open detail panel already loaded, so nothing is awaited before the picker. */
export async function startVodDownload(streamId: number): Promise<void> {
    const item = vodMemory.findItem(streamId);
    if (!item) return;
    const detail = get<VodDetail | null>(VOD_DETAIL);
    const name = detail?.streamId === streamId ? detail.name : item.name;

    const cached = cachedVodSource();
    await enqueue(vodDownloadId(streamId), name, safeFilename(name, item.containerExtension || 'mp4'), async () => {
        // `cachedVodSource()` is empty until a catalog has been opened this
        // session, so the account may still need resolving — after the
        // picker, never before it.
        const account = cached ? null : await resolveActiveXtreamSource();
        return vodItemToRow(item, cached ?? account?.source ?? null, vodCategoryName(item.categoryId)).url || null;
    });
}

/**
 * Queues one episode. Same static-file shape as a movie
 * (`/series/{user}/{pass}/{id}.{ext}`), so it rides the same queue — the
 * only real difference is where the extension comes from.
 *
 * It comes off `series.detail.rows`, not from a `get_series_info` call:
 * that fetch is asynchronous, and awaiting it would spend the click's user
 * activation before the save picker ever opened. The open detail panel has
 * already loaded exactly this data, which is why `SeriesDetailRow` carries
 * `containerExtension` and `season` at all.
 */
export async function startSeriesEpisodeDownload(seriesId: number, episodeId: number | string): Promise<void> {
    const detail = get<SeriesDetail | null>(SERIES_DETAIL);
    if (!detail || detail.seriesId !== seriesId) return;
    const row = detail.rows.find(
        (candidate) => candidate.kind === 'episode' && String(candidate.episodeId) === String(episodeId),
    );
    if (!row || row.kind !== 'episode') return;

    const name = episodeBaseName(detail.name, row.season, row.episode, row.title);
    const cached = cachedSeriesSource();
    await enqueue(
        seriesDownloadId(seriesId, episodeId),
        name,
        safeFilename(name, row.containerExtension || 'mp4'),
        async () => {
            const account = cached ? null : await resolveActiveXtreamSource();
            const source = cached ?? account?.source ?? null;
            return source ? seriesEpisodeUrl(source, row.episodeId, row.containerExtension || 'mp4') : null;
        },
    );
}

export function cancelDownload(id: string): void {
    const entry = find(id);
    if (!entry || !isDownloadBusy(entry.status)) return;

    if (activeId === id) {
        // The adapter answers every cancel with a terminal `cancelled`
        // callback, and `settleActive()` is what advances the queue — so a
        // running transfer is stopped through the handle and never torn down
        // here, or the runner would stall waiting for a report that the
        // teardown swallowed.
        activeHandle?.cancel();
        return;
    }
    // Not started yet: nothing to stop, so it settles immediately.
    forget(id);
    patch(id, { status: 'error', errorReason: 'cancelled' });
}

/** Removes a finished row. A busy entry is cancelled instead — dismissing one would abandon a transfer that is still running. */
export function dismissDownload(id: string): void {
    const entry = find(id);
    if (!entry) return;
    if (isDownloadBusy(entry.status)) {
        cancelDownload(id);
        return;
    }
    remove(id);
    publish();
}

export function clearFinishedDownloads(): void {
    for (const entry of [...queue]) {
        if (!isDownloadBusy(entry.status)) remove(entry.id);
    }
    publish();
}

function remove(id: string): void {
    const index = queue.findIndex((entry) => entry.id === id);
    if (index >= 0) queue.splice(index, 1);
    forget(id);
}

function forget(id: string): void {
    targets.delete(id);
    urls.delete(id);
}

/** Starts the next queued entry if nothing is running — called after every enqueue and every terminal outcome, so the queue advances from exactly one place. */
function pumpQueue(): void {
    while (activeId === null) {
        const next = queue.find((entry) => entry.status === 'queued');
        if (!next) return;
        // `runNext` returns false for an entry that finished without ever
        // becoming active (a browser handoff, or a missing target), so the
        // loop picks up the one behind it instead of returning to a caller
        // that has no reason to try again.
        if (runNext(next)) return;
    }
}

/** @returns whether the entry became the active transfer (and so owns the queue until it settles). */
function runNext(next: DownloadEntry): boolean {
    const id = next.id;
    const target = targets.get(id);
    const url = urls.get(id);
    if (!target || !url) {
        // Only reachable if a target was dropped without its entry — a bug
        // rather than a user outcome, but it must not wedge the queue.
        forget(id);
        patch(id, { status: 'error', errorReason: 'disk' });
        return false;
    }

    // A browser-managed handoff is over the moment it starts: the page can
    // neither watch nor stop it, so it never becomes the active transfer and
    // never blocks the entry behind it.
    if (target.kind === 'handoff') {
        getPlatform().downloads.start(url, target, {
            onProgress: () => undefined,
            onDone: () => undefined,
            onError: () => undefined,
        });
        forget(id);
        patch(id, { status: 'handoff' });
        return false;
    }

    activeId = id;
    patch(id, { status: 'downloading', percent: -1, sizeLabel: '' });

    // The web adapter reports once per network chunk, which on a fast link
    // is far more often than a progress bar can redraw — and every one of
    // them would republish the whole queue. Coalesced to
    // `PROGRESS_INTERVAL_MS`; the completion write still lands on 100%.
    let lastReport = 0;
    activeHandle = getPlatform().downloads.start(url, target, {
        onProgress: ({ receivedBytes, totalBytes }) => {
            if (activeId !== id) return;
            const now = Date.now();
            const percent = percentOf(receivedBytes, totalBytes);
            if (now - lastReport < PROGRESS_INTERVAL_MS && percent < 100) return;
            lastReport = now;
            patch(id, { percent, sizeLabel: formatSizeLabel(receivedBytes, totalBytes) });
        },
        onDone: () => {
            settleActive(id, { status: 'done', percent: 100, errorReason: null });
        },
        onError: (reason: DownloadErrorReason) => {
            settleActive(id, { status: 'error', errorReason: reason });
        },
    });
    return true;
}

function settleActive(id: string, changes: Partial<DownloadEntry>): void {
    // Guard against a late callback from a transfer the queue already moved
    // past — the same hazard, and the same fix, as the player engine's
    // attach token.
    if (activeId !== id) return;
    activeId = null;
    activeHandle = null;
    forget(id);
    patch(id, changes);
    pumpQueue();
}

/** Test-only reset — mirrors `resetPlayerEngineForTests()`'s convention. @internal */
export function resetDownloadsForTests(): void {
    queue.length = 0;
    activeId = null;
    activeHandle = null;
    targets.clear();
    urls.clear();
}
