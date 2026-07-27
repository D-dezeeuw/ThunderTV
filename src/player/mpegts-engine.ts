import type Mpegts from 'mpegts.js';

/**
 * Raw MPEG-TS playback (masterplan Phase 11's mpegts.js engine, pulled
 * forward by the live diagnosis): many Xtream panels don't serve segmented
 * HLS at all — their `.m3u8` is a thin wrapper pointing at an endless raw
 * transport stream, and the `.ts` URL *is* that stream. No browser decodes
 * raw MPEG-TS natively and hls.js rejects it (`levelParsingError`);
 * mpegts.js demuxes it in JS and feeds fMP4 to Media Source Extensions.
 *
 * MSE is the hard requirement, so this works in Chromium/Electron, Chrome,
 * Firefox and desktop Safari — but not on iOS, where Apple exposes no MSE
 * to web content. `isMpegtsSupported()` reports that honestly rather than
 * failing at play time.
 *
 * Dynamically imported (like hls.js) so neither library lands in the
 * initial bundle.
 */
let player: Mpegts.Player | null = null;

export interface MpegtsAttachResult {
    ok: boolean;
    /** Set when the engine could not start at all — surfaced verbatim in the player-bar diagnostic. */
    reason?: string;
}

export async function attachMpegts(
    video: HTMLVideoElement,
    streamUrl: string,
    onFatalError: (detail: string) => void,
): Promise<MpegtsAttachResult> {
    const { default: mpegts } = await import('mpegts.js');
    if (!mpegts.isSupported()) {
        return { ok: false, reason: 'this device has no Media Source Extensions, so raw MPEG-TS cannot be played here (iOS has no MSE for web content)' };
    }

    const instance = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: streamUrl },
        // Live defaults: no stash buffer (latency), and let mpegts.js chase
        // the live edge when the tab has been backgrounded.
        { enableStashBuffer: false, liveBufferLatencyChasing: true },
    );
    player = instance;

    instance.on(mpegts.Events.ERROR, (type: string, detail: string) => {
        console.error('[ThunderTV] mpegts.js error:', type, detail);
        onFatalError(`mpegts ${type}: ${detail}`);
    });

    instance.attachMediaElement(video);
    instance.load();
    await Promise.resolve(instance.play()).catch(() => undefined);
    return { ok: true };
}

export function detachMpegts(): void {
    if (!player) return;
    const instance = player;
    player = null;
    try {
        instance.pause();
        instance.unload();
        instance.detachMediaElement();
        instance.destroy();
    } catch {
        // A half-initialized player can throw on teardown — never let that
        // block the next channel from attaching.
    }
}

/** Test-only reset. @internal */
export function resetMpegtsForTests(): void {
    player = null;
}
