/**
 * MVP playback engine: a single `<video>` element driven by hls.js
 * (dynamically imported so the ~150 kB library never lands in the initial
 * bundle) with a native-HLS path for Safari/iOS, which refuses a second
 * decoder for a format it already ships natively.
 *
 * Fatal failures on either path report through `reportPlaybackError()`
 * (rendered in the player bar) — on a phone there is no devtools console,
 * so a dead stream must say why on screen.
 *
 * Full multi-engine selection (native/hls.js/mpegts.js) is Phase 11's
 * scope — this is the minimum real player needed to prove a channel
 * actually plays.
 */
import type Hls from 'hls.js';
import { reportPlaybackError } from '../state/player.actions';

let hls: Hls | null = null;
let nativeErrorHandler: (() => void) | null = null;
let nativeErrorVideo: HTMLVideoElement | null = null;

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

function attachNativeErrorReporting(video: HTMLVideoElement): void {
    const handler = (): void => {
        const err = video.error;
        const label = err ? (MEDIA_ERROR_LABELS[err.code] ?? `code ${String(err.code)}`) : 'unknown';
        const detail = err?.message ? `${label} — ${err.message}` : label;
        console.error('[ThunderTV] native playback error:', detail);
        reportPlaybackError(detail);
    };
    video.addEventListener('error', handler);
    nativeErrorHandler = handler;
    nativeErrorVideo = video;
}

export async function attachAndPlay(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    detach(video);
    reportPlaybackError(null);
    attachNativeErrorReporting(video);

    if (supportsNativeHls(video)) {
        video.src = streamUrl;
        await video.play().catch(() => undefined);
        return;
    }

    const { default: HlsCtor } = await import('hls.js');
    if (!HlsCtor.isSupported()) {
        // Last-resort fallback (e.g. a raw .ts MPEG-TS URL) — let the
        // browser's own media pipeline try rather than failing outright.
        video.src = streamUrl;
        await video.play().catch(() => undefined);
        return;
    }

    const instance = new HlsCtor();
    hls = instance;
    instance.loadSource(streamUrl);
    instance.attachMedia(video);
    instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
    });
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.error('[ThunderTV] hls.js fatal error:', data.type, data.details);
        reportPlaybackError(`${data.type}: ${data.details}`);
    });
}

export function detach(video: HTMLVideoElement): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
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
}
