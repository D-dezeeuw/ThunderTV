import type Mpegts from 'mpegts.js';
import type { BufferingMode } from '../state/settings';
import { escalateStashKb, estimateStashKb, isTopRung, StallTracker } from './adaptive-buffer';

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
 * to web content. `attachMpegts()` reports that honestly rather than
 * failing at play time.
 *
 * Dynamically imported (like hls.js) so neither library lands in the
 * initial bundle.
 */
let player: Mpegts.Player | null = null;
/** Bumped on every attach/detach so a retry timer from a previous channel can never touch the current one. */
let generation = 0;
let recoveries = 0;
let stallListener: { video: HTMLVideoElement; handler: () => void } | null = null;

/** A live stream is never "finished" — its transport can still hiccup. Give a flaky link several free recoveries before surfacing anything. */
const MAX_RECOVERIES = 6;
const RECOVERY_DELAY_MS = 1200;

export interface MpegtsAttachResult {
    ok: boolean;
    /** Set when the engine could not start at all — surfaced verbatim in the player-bar diagnostic. */
    reason?: string;
}

/** Fixed rung for `smooth`; `auto` computes its own and grows it from measured stalls. */
const SMOOTH_STASH_KB = 1024;

/**
 * Buffered modes trade a few seconds of latency for jitter tolerance: a
 * real input stash, no chasing the live edge, and source-buffer cleanup so
 * an hours-long channel cannot grow memory without bound. Low latency is
 * the opposite trade — worth it only on a solid connection.
 *
 * The original config here was the low-latency one, which on weak Wi-Fi
 * rebuffered constantly: no stash to absorb jitter, plus latency chasing
 * that sprints to the live edge and immediately starves again.
 */
function configFor(lowLatency: boolean, stashKb: number): Mpegts.Config {
    const shared: Mpegts.Config = {
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 60,
        autoCleanupMinBackwardDuration: 30,
        // Live: never let the loader idle — `lazyLoad` pausing the fetch is
        // for VOD seeking, and on a live feed it just invites stalls.
        lazyLoad: false,
    };
    if (lowLatency) {
        return {
            ...shared,
            enableStashBuffer: false,
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 3,
            liveBufferLatencyMinRemain: 0.5,
        };
    }
    return {
        ...shared,
        enableStashBuffer: true,
        // KB. Well above mpegts.js's 384 default — this is the buffer that
        // absorbs Wi-Fi jitter before the decoder ever notices.
        stashInitialSize: stashKb,
        liveBufferLatencyChasing: false,
    };
}

export interface AttachMpegtsOptions {
    buffering: BufferingMode;
    /** Called only for failures the engine cannot recover from — the caller then advances its engine chain. */
    onFatalError: (detail: string) => void;
}

export async function attachMpegts(
    video: HTMLVideoElement,
    streamUrl: string,
    options: AttachMpegtsOptions,
): Promise<MpegtsAttachResult> {
    const { default: mpegts } = await import('mpegts.js');
    if (!mpegts.isSupported()) {
        return {
            ok: false,
            reason: 'this device has no Media Source Extensions, so raw MPEG-TS cannot be played here (iOS has no MSE for web content)',
        };
    }

    detachMpegts();
    const myGeneration = ++generation;
    recoveries = 0;

    const lowLatency = options.buffering === 'lowLatency';
    const adaptive = options.buffering === 'auto';
    let stashKb = adaptive ? estimateStashKb() : SMOOTH_STASH_KB;
    const stalls = new StallTracker();
    if (adaptive) console.info(`[ThunderTV] adaptive buffering: starting at ${String(stashKb)}KB`);
    /**
     * Once the demuxer has reported real media, the format is proven: from
     * then on an error is the network dropping, not the wrong engine, so it
     * must be retried in place instead of failing over to hls.js/native —
     * which would abandon a stream that actually works.
     */
    let formatProven = false;

    /**
     * Adaptive escalation: a `waiting` event is the video element telling
     * us it ran dry. Enough of them inside the window (and not too soon
     * after the last rebuild) means the current rung cannot hold this link,
     * so rebuild one rung deeper. At the top rung there is nothing left to
     * try — more stash would only add latency to a bandwidth problem.
     */
    const onStall = (): void => {
        if (!adaptive || myGeneration !== generation) return;
        if (!stalls.shouldEscalate(Date.now()) || isTopRung(stashKb)) return;
        stashKb = escalateStashKb(stashKb);
        console.info(`[ThunderTV] adaptive buffering: stalls detected — growing buffer to ${String(stashKb)}KB`);
        destroyPlayer();
        create();
    };

    const create = (): void => {
        const instance = mpegts.createPlayer(
            { type: 'mpegts', isLive: true, url: streamUrl },
            configFor(lowLatency, stashKb),
        );
        player = instance;

        instance.on(mpegts.Events.MEDIA_INFO, () => {
            formatProven = true;
            recoveries = 0;
        });

        instance.on(mpegts.Events.ERROR, (type: string, detail: string) => {
            if (myGeneration !== generation) return;
            console.error('[ThunderTV] mpegts.js error:', type, detail);

            if (formatProven && recoveries < MAX_RECOVERIES) {
                recoveries += 1;
                console.warn(`[ThunderTV] transient stream error — recovery ${String(recoveries)}/${String(MAX_RECOVERIES)}`);
                setTimeout(() => {
                    if (myGeneration !== generation) return;
                    destroyPlayer();
                    create();
                }, RECOVERY_DELAY_MS);
                return;
            }
            options.onFatalError(`mpegts ${type}: ${detail}`);
        });

        instance.attachMediaElement(video);
        instance.load();
        void Promise.resolve(instance.play()).catch(() => undefined);
    };

    video.addEventListener('waiting', onStall);
    stallListener = { video, handler: onStall };

    create();
    return { ok: true };
}

function destroyPlayer(): void {
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

export function detachMpegts(): void {
    generation += 1;
    if (stallListener) {
        stallListener.video.removeEventListener('waiting', stallListener.handler);
        stallListener = null;
    }
    destroyPlayer();
}

/** Test-only reset. @internal */
export function resetMpegtsForTests(): void {
    player = null;
    generation = 0;
    recoveries = 0;
    stallListener = null;
}
