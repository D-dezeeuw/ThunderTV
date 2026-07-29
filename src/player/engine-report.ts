import { strings } from '../app/strings';
import { reportPlaybackError } from '../state/player.actions';
import { refreshActiveXtreamSource } from '../state/xtream-refresh';
import { isProgressiveFile } from './engine-select';
import { describeStream } from './stream-probe';

/**
 * Turning a dead stream into a sentence — the reporting half of
 * `engine.ts`, split out because that file sits on ESLint's 400-line hard
 * ceiling (the same "own file, one import back" precedent
 * `src/app/strings.en.player.ts` and `src/state/registry-overflow.ts`
 * already set).
 *
 * Both functions are pure of module state: `engine.ts` passes in the URL
 * that failed and a `superseded()` predicate closing over its own attach
 * token, because every one of these paths can outlive the stream it
 * describes.
 */

const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** MediaError codes → readable labels (`video.error.message` is empty on most browsers). */
const MEDIA_ERROR_LABELS: Record<number, string> = {
    1: 'aborted',
    2: 'network error',
    3: 'decode error',
    4: 'source not supported',
};

/**
 * "source not supported" on a file the chain deliberately handed to the
 * browser is not a mystery to diagnose — the container is one this device
 * has no demuxer for (Chromium advertises no Matroska support at all). Say
 * that, and point at the way out, rather than leaving a four-word
 * MediaError label to be interpreted.
 */
export function describeMediaError(err: MediaError | null, url: string | null): string {
    const label = err ? (MEDIA_ERROR_LABELS[err.code] ?? `code ${String(err.code)}`) : 'unknown';
    const withMessage = err?.message ? `${label} — ${err.message}` : label;
    if (err?.code !== MEDIA_ERR_SRC_NOT_SUPPORTED || !isProgressiveFile(url ?? '')) return withMessage;
    return `${withMessage} — ${strings.list.playerUnsupportedContainer}`;
}

/** Re-reports `baseDetail` with what the provider actually sent, once a probe of `url` comes back. */
export function appendStreamProbe(url: string | null, baseDetail: string, superseded: () => boolean): void {
    if (!url) return;
    void describeStream(url).then(async (summary) => {
        // The probe is a network round trip, so a later attempt in the chain
        // — or an entirely different channel the viewer has since picked —
        // routinely gets a picture up before it answers. Reporting then would
        // put a failure notice over a stream the user is watching.
        if (superseded()) return;
        reportPlaybackError(`${baseDetail} — ${summary}`);
        // A 404 from the provider is either a stale catalog (panels
        // renumber stream ids routinely) or the panel refusing streams to
        // cloud/proxy IPs while allowing the API — refresh distinguishes
        // them: fresh ids that still 404 point at IP blocking.
        if (!summary.includes('HTTP 404')) return;
        const outcome = await refreshActiveXtreamSource('error');
        if (superseded()) return;
        if (outcome === 'refreshed') {
            reportPlaybackError(`${baseDetail} — ${summary}; channel list refreshed — try the channel again`);
        } else if (outcome === 'skipped') {
            reportPlaybackError(
                `${baseDetail} — ${summary}; list was refreshed recently, so these 404s suggest the provider blocks cloud-proxy IPs for streams — a home-hosted proxy (same script on a NAS/Pi) or the desktop app would be needed`,
            );
        } else if (outcome === 'failed') {
            reportPlaybackError(`${baseDetail} — ${summary}; automatic channel-list refresh failed`);
        }
    });
}
