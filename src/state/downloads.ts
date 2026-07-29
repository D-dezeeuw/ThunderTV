import { setValue } from 'spektrum';
import type { DownloadFailure } from '../core/platform/download-adapter';

/**
 * The download queue's Spektrum surface. Movies only, deliberately: an
 * Xtream VOD URL is a static file with a real `Content-Length` and a real
 * end, while a live channel is an endless transport stream with neither —
 * there is no "done" to download to. Series episodes are the same shape as
 * movies and would slot in behind the same queue; they are simply not
 * wired up yet.
 *
 * The whole queue lives in state (not module memory) because it is small
 * and bounded by construction — `DOWNLOAD_QUEUE_CAP` entries of a handful
 * of scalars each — and every one of them is on screen. That is the exact
 * opposite of the catalogs' bulk-data situation (`state/README.md`), so the
 * usual "publish a compact slice, keep the payload in module memory" rule
 * has nothing to bypass here.
 *
 * What is *not* in state: the live `DownloadHandle` for the running
 * transfer. It is a function-bearing object, so it belongs in
 * `downloads.actions.ts`'s module memory, not in a serializable store.
 */
export const DOWNLOADS_ITEMS = 'downloads.items';
export const DOWNLOADS_ACTIVE_ID = 'downloads.activeId';

/**
 * Deliberately small. The queue runs one transfer at a time (see
 * `downloads.actions.ts`), so a long queue is a long wait, not throughput —
 * and most Xtream panels cap concurrent connections per account, which is
 * the same reason the runner is serial in the first place.
 */
export const DOWNLOAD_QUEUE_CAP = 12;

/**
 * - `queued`: prepared and waiting for the runner.
 * - `downloading`: the active transfer; the only status with live progress.
 * - `handoff`: given to the browser's own download manager, which the page
 *   cannot observe or stop (`capabilities.downloads === 'handoff'`). A
 *   terminal status on purpose — showing a progress bar the page cannot
 *   move, or a Cancel button that cannot cancel, would be a lie.
 * - `done` / `error`: terminal.
 */
export type DownloadStatus = 'queued' | 'downloading' | 'handoff' | 'done' | 'error';

/** Enum-ish and UI-copy-free (`state/README.md`'s rule) — the UI stage maps each to its own message. `'cancelled'` is a viewer action rather than a fault, but it ends a transfer the same way, so it travels the same field. */
export type DownloadErrorReason = DownloadFailure | null;

export interface DownloadEntry {
    /** `vod:<streamId>` — stable, so asking twice for the same movie finds the existing entry instead of queueing a duplicate. */
    id: string;
    /** The movie's display title, for the queue row. */
    name: string;
    /** The name it is being saved under, which the viewer may have changed in the save dialog. */
    filename: string;
    status: DownloadStatus;
    /**
     * 0–100, or `-1` when the provider sent no `Content-Length` and there is
     * nothing to be a percentage *of* — the UI shows an indeterminate bar
     * for that rather than inventing a number.
     *
     * Rounded here, in state, never via `Math.round()` inside a `{{ }}`
     * expression: Spektrum's evaluator has no guaranteed access to `Math`
     * (`state/README.md`'s note on `series.detail.rows`).
     */
    percent: number;
    /** Pre-formatted `"412 MB / 1.8 GB"`. Units, not copy — `formatBytes()` below, so no template does arithmetic. */
    sizeLabel: string;
    errorReason: DownloadErrorReason;
}

export interface DownloadsState {
    items: DownloadEntry[];
    activeId: string | null;
}

export const DOWNLOADS_DEFAULTS: DownloadsState = {
    items: [],
    activeId: null,
};

export function initDownloadsState(): void {
    setValue(DOWNLOADS_ITEMS, DOWNLOADS_DEFAULTS.items);
    setValue(DOWNLOADS_ACTIVE_ID, DOWNLOADS_DEFAULTS.activeId);
}

/** The one place the movie→entry id mapping is spelled, so the detail panel's lookup and the queue's writes can never drift. */
export function vodDownloadId(streamId: number): string {
    return `vod:${String(streamId)}`;
}

/**
 * `series:<seriesId>:<episodeId>` — keyed on both, not the episode id alone.
 * Episode ids are unique per provider in practice, but the series id is what
 * makes an entry legible in the queue and what a future "cancel every
 * episode of this show" would group on.
 */
export function seriesDownloadId(seriesId: number, episodeId: number | string): string {
    return `series:${String(seriesId)}:${String(episodeId)}`;
}

/**
 * `Show - S01E03 - Title`. Zero-padded so a season's episodes sort in order
 * in a file manager, which is the whole reason to impose a scheme rather
 * than saving under the provider's raw episode title. The title is dropped
 * when the provider only repeats the episode number in it, which many do.
 */
export function episodeBaseName(showName: string, season: number, episode: number, title: string): string {
    const code = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const trimmed = title.trim();
    const suffix = trimmed && trimmed !== String(episode) ? ` - ${trimmed}` : '';
    return `${showName} - ${code}${suffix}`;
}

/** True while an entry still owes the viewer something — what the detail panel disables its buttons on. */
export function isDownloadBusy(status: DownloadStatus): boolean {
    return status === 'queued' || status === 'downloading';
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Byte counts as a human-readable size. Lives here rather than in
 * `strings.ts` because it is a number format, not copy — the unit
 * abbreviations are the same in every locale this app ships, and routing
 * them through the string dictionaries would invite three translations of
 * "MB" that must all stay identical.
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${String(UNITS[0])}`;
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    // Whole numbers for bytes/KB (a "1.0 KB" reads as noise), one decimal
    // from MB up, where the fraction is the part that actually moves.
    const rounded = unit <= 1 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${String(rounded)} ${String(UNITS[unit])}`;
}

/** `"412 MB / 1.8 GB"`, or just the received count when the provider sent no total. */
export function formatSizeLabel(receivedBytes: number, totalBytes: number | null): string {
    const received = formatBytes(receivedBytes);
    return totalBytes === null ? received : `${received} / ${formatBytes(totalBytes)}`;
}

/** `-1` (indeterminate) rather than a fabricated 0 when there is no total to divide by. */
export function percentOf(receivedBytes: number, totalBytes: number | null): number {
    if (totalBytes === null || totalBytes <= 0) return -1;
    return Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
}
