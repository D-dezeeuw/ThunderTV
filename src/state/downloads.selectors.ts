import { computed, type State } from 'spektrum';
import { DOWNLOADS_ITEMS, isDownloadBusy, seriesDownloadId, vodDownloadId, type DownloadEntry } from './downloads';
import { SERIES_DETAIL, SERIES_DETAIL_ID, type SeriesDetail } from './series';
import { VOD_DETAIL_ID } from './vod';
import { PLATFORM_CAPABILITIES } from './ui';

interface DownloadsSlice {
    downloads?: { items?: DownloadEntry[] };
    vod?: { detailId?: number | null };
    series?: { detailId?: number | null; detail?: SeriesDetail | null };
    platform?: { capabilities?: { downloads?: string } };
}

/**
 * Everything the markup needs about downloads, so no template has to do
 * arithmetic, array lookups, or capability comparisons of its own.
 *
 * `download.detail*` is the open movie's own slice: the detail panel shows
 * exactly one title, so the panel binds to a flat handful of scalars rather
 * than searching `downloads.items` in a `{{ }}` expression.
 */
export function registerDownloadSelectors(): void {
    registerDetailComputeds();
    registerEpisodeComputeds();
    registerQueueComputeds();
}

function itemsOf(state: State): DownloadEntry[] {
    return (state as DownloadsSlice).downloads?.items ?? [];
}

function openDetailEntry(state: State): DownloadEntry | null {
    const detailId = (state as DownloadsSlice).vod?.detailId;
    if (detailId === null || detailId === undefined) return null;
    const id = vodDownloadId(detailId);
    return itemsOf(state).find((entry) => entry.id === id) ?? null;
}

function registerDetailComputeds(): void {
    /** The whole entry, for the panel's progress row — `null` when this movie has never been asked for. */
    computed('download.detail', [DOWNLOADS_ITEMS, VOD_DETAIL_ID], (state: State) => openDetailEntry(state));

    /**
     * The one flag the panel disables Play/Download/Close on. Busy means
     * queued or downloading — a finished or failed entry leaves the panel
     * fully usable again.
     */
    computed('download.detailBusy', [DOWNLOADS_ITEMS, VOD_DETAIL_ID], (state: State) => {
        const entry = openDetailEntry(state);
        return entry !== null && isDownloadBusy(entry.status);
    });

    /**
     * Whether the bar has a real percentage to show. `percent === -1` means
     * the provider sent no `Content-Length`, and an indeterminate bar is the
     * honest rendering of that (`downloads.ts`).
     */
    computed('download.detailMeasured', [DOWNLOADS_ITEMS, VOD_DETAIL_ID], (state: State) => {
        const entry = openDetailEntry(state);
        return entry !== null && entry.percent >= 0;
    });

    /**
     * The bar's value as a number that is *always* finite — never
     * `undefined`, and never the `-1` sentinel.
     *
     * `data-if` only toggles `display`; it does not stop the element's other
     * bindings from evaluating. So a `<progress :value="download.detail.percent">`
     * still runs while no movie is open, assigns `undefined` to
     * `HTMLProgressElement.value`, and throws — the element is hidden, but
     * the binding is not. Anything bound to a numeric DOM property needs a
     * selector like this one rather than an optional-chained path.
     */
    computed('download.detailPercent', [DOWNLOADS_ITEMS, VOD_DETAIL_ID], (state: State) => {
        const percent = openDetailEntry(state)?.percent ?? 0;
        return percent > 0 ? percent : 0;
    });

    /**
     * Whether this host can save a file at all. `'handoff'` still counts —
     * the browser takes the transfer and the queue says so; only `'none'`
     * hides the button, since offering a control that cannot work is worse
     * than not offering it.
     */
    computed('download.supported', [PLATFORM_CAPABILITIES], (state: State) => {
        return ((state as DownloadsSlice).platform?.capabilities?.downloads ?? 'none') !== 'none';
    });
}

/**
 * The open series' episode list, each row carrying its own download state.
 *
 * The panel binds `data-each` to *this* rather than to `series.detail.rows`
 * directly, because a flat `data-each` row cannot look itself up in another
 * array — the join has to happen before the template sees it. Doing it here
 * also keeps the dependency pointing the right way: downloads knows about
 * series, series knows nothing about downloads.
 */
function registerEpisodeComputeds(): void {
    computed('download.episodeRows', [DOWNLOADS_ITEMS, SERIES_DETAIL, SERIES_DETAIL_ID], (state: State) => {
        const typed = state as DownloadsSlice;
        const seriesId = typed.series?.detailId;
        const rows = typed.series?.detail?.rows ?? [];
        const entries = itemsOf(state);
        return rows.map((row) => {
            if (row.kind !== 'episode' || seriesId === null || seriesId === undefined) {
                return { ...row, downloadId: '', downloadBusy: false, downloadPercent: 0, downloadMeasured: false, downloadSizeLabel: '', downloadDone: false };
            }
            const downloadId = seriesDownloadId(seriesId, row.episodeId);
            const entry = entries.find((candidate) => candidate.id === downloadId);
            return {
                ...row,
                downloadId,
                downloadBusy: entry !== undefined && isDownloadBusy(entry.status),
                // Always finite: `data-if` does not stop a `<progress :value>`
                // binding from evaluating, so `undefined`/`-1` here would
                // throw or render nonsense (see `download.detailPercent`).
                downloadPercent: entry && entry.percent > 0 ? entry.percent : 0,
                downloadMeasured: entry !== undefined && entry.percent >= 0,
                downloadSizeLabel: entry?.sizeLabel ?? '',
                downloadDone: entry?.status === 'done',
            };
        });
    });
}

function registerQueueComputeds(): void {
    /** Drives the queue panel's own visibility — it stays out of the way entirely until there is something to report. */
    computed('download.queueVisible', [DOWNLOADS_ITEMS], (state: State) => itemsOf(state).length > 0);

    /** Enables "Clear finished" only when there is something finished to clear. */
    computed('download.hasFinished', [DOWNLOADS_ITEMS], (state: State) =>
        itemsOf(state).some((entry) => !isDownloadBusy(entry.status)),
    );

    /**
     * A pre-shaped copy of the queue for `data-each`: the per-row booleans
     * are computed here rather than as `{{ }}` expressions, which keeps the
     * markup to plain `data-if="row.flag"` — the same reason
     * `series.detail.rows` is pre-flattened (`state/README.md`).
     */
    computed('download.rows', [DOWNLOADS_ITEMS], (state: State) =>
        itemsOf(state).map((entry) => ({
            ...entry,
            busy: isDownloadBusy(entry.status),
            measured: entry.percent >= 0,
            failed: entry.status === 'error',
            finished: entry.status === 'done',
            handedOff: entry.status === 'handoff',
        })),
    );
}
