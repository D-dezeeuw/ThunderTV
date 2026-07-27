import type Hls from 'hls.js';
import { reportPlaybackError } from '../state/player.actions';
import { SETTINGS_BUFFERING, SETTINGS_PLAYBACK_ENGINE, type BufferingMode, type PlaybackEngine } from '../state/settings';
import { get } from '../state/typed';
import { refreshActiveXtreamSource } from '../state/xtream-refresh';
import { attachMpegts, detachMpegts } from './mpegts-engine';
import { alternateFormatUrl, describeStream } from './stream-probe';
import { monitorStreamHealth, stopStreamHealthMonitor } from './stream-health';

/**
 * Playback engine selection, as an ordered attempt chain. Three real
 * formats show up in IPTV:
 *
 *  - raw MPEG-TS    → mpegts.js (`mpegts-engine.ts`). The DEFAULT: most
 *    Xtream panels serve an endless transport stream whose `.m3u8` is only
 *    a wrapper, which hls.js rejects outright (`levelParsingError`) and no
 *    browser decodes natively. mpegts.js demuxes it to MSE.
 *  - segmented HLS  → hls.js, or the browser's own native HLS on
 *    Safari/iOS, which refuses a second decoder for a format it ships.
 *  - anything else  → hand the URL to the browser and let its pipeline try.
 *
 * `settings.playbackEngine` picks which is tried FIRST; the others follow
 * as fallbacks, so a wrong preference costs one retry rather than
 * playback. Each attempt uses the URL form its engine expects — the
 * `.ts`/`.m3u8` sibling of what the catalog baked (`alternateFormatUrl`),
 * since Xtream serves the same channel under both.
 *
 * Fatal failures report through `reportPlaybackError()` (rendered in the
 * player bar) with a probe of what the provider actually sent — on a phone
 * there is no devtools console, so a dead stream must say why on screen.
 */
let hls: Hls | null = null;
let nativeErrorHandler: (() => void) | null = null;
let nativeErrorVideo: HTMLVideoElement | null = null;
let lastStreamUrl: string | null = null;
/** The URL as baked in the catalog; each attempt derives its own `.ts`/`.m3u8` form from it. */
let baseStreamUrl: string | null = null;
let chain: PlaybackEngine[] = [];
let chainIndex = 0;
let failures: string[] = [];

function supportsNativeHls(video: HTMLVideoElement): boolean {
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/** MediaError codes → readable labels (`video.error.message` is empty on most browsers). */
const MEDIA_ERROR_LABELS: Record<number, string> = {
    1: 'aborted',
    2: 'network error',
    3: 'decode error',
    4: 'source not supported',
};

/**
 * A `<video>` element error covers both the native attempts and the
 * MSE-fed ones (mpegts.js/hls.js push into the same element), so it routes
 * through `advanceChain()` like any other engine failure — which reports
 * and probes once the chain is exhausted.
 */
function attachNativeErrorReporting(video: HTMLVideoElement): void {
    const handler = (): void => {
        const err = video.error;
        const label = err ? (MEDIA_ERROR_LABELS[err.code] ?? `code ${String(err.code)}`) : 'unknown';
        const detail = err?.message ? `${label} — ${err.message}` : label;
        console.error('[ThunderTV] native playback error:', detail);
        void advanceChain(video, detail);
    };
    video.addEventListener('error', handler);
    nativeErrorHandler = handler;
    nativeErrorVideo = video;
}

function appendStreamProbe(baseDetail: string): void {
    const url = lastStreamUrl;
    if (!url) return;
    void describeStream(url).then(async (summary) => {
        reportPlaybackError(`${baseDetail} — ${summary}`);
        // A 404 from the provider is either a stale catalog (panels
        // renumber stream ids routinely) or the panel refusing streams to
        // cloud/proxy IPs while allowing the API — refresh distinguishes
        // them: fresh ids that still 404 point at IP blocking.
        if (summary.includes('HTTP 404')) {
            const outcome = await refreshActiveXtreamSource('error');
            if (outcome === 'refreshed') {
                reportPlaybackError(`${baseDetail} — ${summary}; channel list refreshed — try the channel again`);
            } else if (outcome === 'skipped') {
                reportPlaybackError(
                    `${baseDetail} — ${summary}; list was refreshed recently, so these 404s suggest the provider blocks cloud-proxy IPs for streams — a home-hosted proxy (same script on a NAS/Pi) or the desktop app would be needed`,
                );
            } else if (outcome === 'failed') {
                reportPlaybackError(`${baseDetail} — ${summary}; automatic channel-list refresh failed`);
            }
        }
    });
}

/** The `.ts` form of a stream URL — Xtream serves the same channel under both extensions. */
function tsFormOf(url: string): string {
    if (url.endsWith('.ts')) return url;
    const alt = alternateFormatUrl(url);
    return alt?.label === '.ts' ? alt.url : url;
}

/** The `.m3u8` form of a stream URL. */
function hlsFormOf(url: string): string {
    if (url.endsWith('.m3u8')) return url;
    const alt = alternateFormatUrl(url);
    return alt?.label === '.m3u8' ? alt.url : url;
}

function preferredEngine(): PlaybackEngine {
    const configured = get<PlaybackEngine | null>(SETTINGS_PLAYBACK_ENGINE);
    return configured ?? 'mpegts';
}

/** Preference first, then the remaining engines as fallbacks — every stream gets all three before giving up. */
function attemptChain(preference: PlaybackEngine): PlaybackEngine[] {
    const rest = (['mpegts', 'hls', 'native'] as PlaybackEngine[]).filter((e) => e !== preference);
    return [preference, ...rest];
}

export async function attachAndPlay(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    detach(video);
    reportPlaybackError(null);
    baseStreamUrl = streamUrl;
    chain = attemptChain(preferredEngine());
    chainIndex = 0;
    failures = [];
    attachNativeErrorReporting(video);
    monitorStreamHealth(video);
    await runCurrentAttempt(video);
}

/** Runs `chain[chainIndex]`; engine failures call `advanceChain()`, which re-enters here until the chain is exhausted. */
async function runCurrentAttempt(video: HTMLVideoElement): Promise<void> {
    const engine = chain[chainIndex];
    const base = baseStreamUrl;
    if (!engine || !base) return;

    if (engine === 'mpegts') {
        const url = tsFormOf(base);
        lastStreamUrl = url;
        const result = await attachMpegts(video, url, {
            buffering: get<BufferingMode | null>(SETTINGS_BUFFERING) ?? 'auto',
            onFatalError: (detail) => {
                void advanceChain(video, detail);
            },
        });
        if (!result.ok) await advanceChain(video, result.reason ?? 'mpegts unavailable');
        return;
    }

    if (engine === 'native') {
        lastStreamUrl = base;
        video.src = base;
        await video.play().catch(() => undefined);
        return;
    }

    const url = hlsFormOf(base);
    lastStreamUrl = url;
    if (supportsNativeHls(video)) {
        video.src = url;
        await video.play().catch(() => undefined);
        return;
    }

    const { default: HlsCtor } = await import('hls.js');
    if (!HlsCtor.isSupported()) {
        await advanceChain(video, 'hls.js unsupported on this device');
        return;
    }

    const instance = new HlsCtor();
    hls = instance;
    instance.loadSource(url);
    instance.attachMedia(video);
    instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
    });
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.error('[ThunderTV] hls.js fatal error:', data.type, data.details);
        void advanceChain(video, `${String(data.type)}: ${String(data.details)}`);
    });
}

/**
 * One engine failed: tear it down and try the next in the chain. Only the
 * last failure is reported (with a probe) — the intermediate ones are
 * expected noise when the preference does not match the provider's format.
 */
async function advanceChain(video: HTMLVideoElement, detail: string): Promise<void> {
    failures.push(detail);
    detachEngines();
    chainIndex += 1;
    if (chainIndex < chain.length) {
        await runCurrentAttempt(video);
        return;
    }
    const summary = failures.join('; ');
    reportPlaybackError(summary);
    appendStreamProbe(summary);
}

function detachEngines(): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    detachMpegts();
}

export function detach(video: HTMLVideoElement): void {
    stopStreamHealthMonitor();
    detachEngines();
    if (nativeErrorHandler && nativeErrorVideo) {
        nativeErrorVideo.removeEventListener('error', nativeErrorHandler);
        nativeErrorHandler = null;
        nativeErrorVideo = null;
    }
    video.removeAttribute('src');
    video.load();
}

/** Test-only reset — mirrors `resetVirtualListForTests()`'s convention (Phase 08). @internal */
export function resetPlayerEngineForTests(): void {
    hls = null;
    nativeErrorHandler = null;
    nativeErrorVideo = null;
    lastStreamUrl = null;
    baseStreamUrl = null;
    chain = [];
    chainIndex = 0;
    failures = [];
}
