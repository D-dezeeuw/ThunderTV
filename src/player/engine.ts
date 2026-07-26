/**
 * MVP playback engine: a single `<video>` element driven by hls.js
 * (dynamically imported so the ~150 kB library never lands in the initial
 * bundle) with a native-HLS fallback for Safari/iOS, which refuses a
 * second decoder for a format it already ships natively.
 *
 * Full multi-engine selection (native/hls.js/mpegts.js) is Phase 11's
 * scope — this is the minimum real player needed to prove a channel
 * actually plays.
 */
import type Hls from 'hls.js';

let hls: Hls | null = null;

function supportsNativeHls(video: HTMLVideoElement): boolean {
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export async function attachAndPlay(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    detach(video);

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
    // Fatal decode/network/media errors would otherwise fail silently — a
    // real diagnostic surface is Phase 11's scope; this is the minimum
    // needed so a broken stream is at least visible in the console.
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (data.fatal) console.error('[ThunderTV] hls.js fatal error:', data.type, data.details);
    });
}

export function detach(video: HTMLVideoElement): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    video.removeAttribute('src');
    video.load();
}

/** Test-only reset — mirrors `resetVirtualListForTests()`'s convention (Phase 08). @internal */
export function resetPlayerEngineForTests(): void {
    hls = null;
}
