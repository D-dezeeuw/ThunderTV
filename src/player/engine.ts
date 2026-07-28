import type Hls from 'hls.js';
import { reportPlaybackError } from '../state/player.actions';
import { SETTINGS_BUFFERING, SETTINGS_PLAYBACK_ENGINE, type BufferingMode, type PlaybackEngine } from '../state/settings';
import { get } from '../state/typed';
import { refreshActiveXtreamSource } from '../state/xtream-refresh';
import { createHlsTrackEngine } from './hls-tracks';
import { attachMpegts, detachMpegts } from './mpegts-engine';
import { createNativeTrackEngine } from './native-tracks';
import type { PlayerEngine } from './player-engine';
import { alternateFormatUrl, describeStream } from './stream-probe';
import { monitorStreamHealth, stopStreamHealthMonitor } from './stream-health';
import type { TrackSnapshot } from './tracks';

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
/**
 * Bumped by every `attachAndPlay()`/`detach()`. Attaching is asynchronous
 * (`import('mpegts.js')`, `import('hls.js')`, `video.play()`) while all the
 * state below it — plus the single shared `<video>` — is module-global, so
 * switching channels mid-attach left the *previous* attempt's continuations
 * running against the new stream: the old attempt resumed after its import,
 * tore down the player that had replaced it and attached its own. That is
 * "stream 1 kept playing and stream 2 failed", and two MediaSources on one
 * element is what Chromium's "non-existent mailbox"/"Invalid mailbox"
 * overlay errors report. Every async continuation and engine callback
 * carries the token it started with and bails once it is stale.
 */
let attachToken = 0;
let hls: Hls | null = null;
let nativeErrorHandler: (() => void) | null = null;
let nativePlayingHandler: (() => void) | null = null;
let nativeErrorVideo: HTMLVideoElement | null = null;
let lastStreamUrl: string | null = null;
/** True once the current attach has produced actual playback — see `advanceChain()`. */
let playing = false;
/** The URL as baked in the catalog; each attempt derives its own `.ts`/`.m3u8` form from it. */
let baseStreamUrl: string | null = null;
let chain: PlaybackEngine[] = [];
let chainIndex = 0;
let failures: string[] = [];

/** The track-control surface of whichever attempt is currently attached, if it exposes one — see `player-engine.ts`. */
let activeTrackEngine: PlayerEngine | null = null;
/** Cleanup for `activeTrackEngine`'s own listeners (native's `textTracks`/`audioTracks` `addtrack`/`change`); `null` when the engine needs none (hls.js/mpegts — `hls.destroy()`/`detachMpegts()` already tear those down). */
let activeTrackEngineDispose: (() => void) | null = null;
/** The (single) external subscriber registered via `onTracksChanged()` below — re-applied to each new `activeTrackEngine` so it survives a chain fallback or a channel switch. */
let tracksChangedListener: (() => void) | null = null;

/** mpegts.js has no track-switching API — an explicit empty snapshot so callers can tell "attached, nothing to offer" from "nothing attached yet". */
const MPEGTS_TRACK_ENGINE: PlayerEngine = {
    getTracks: (): TrackSnapshot => ({ audio: [], subtitles: [] }),
};

/** True once a newer `attachAndPlay()`/`detach()` has superseded the attach that took `token`. */
function isStale(token: number): boolean {
    return token !== attachToken;
}

function setActiveTrackEngine(engine: PlayerEngine | null, dispose: (() => void) | null = null): void {
    activeTrackEngineDispose?.();
    activeTrackEngine = engine;
    activeTrackEngineDispose = dispose;
    if (tracksChangedListener) engine?.onTracksChanged?.(tracksChangedListener);
}

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
function attachNativeErrorReporting(video: HTMLVideoElement, token: number): void {
    const handler = (): void => {
        const err = video.error;
        const label = err ? (MEDIA_ERROR_LABELS[err.code] ?? `code ${String(err.code)}`) : 'unknown';
        const detail = err?.message ? `${label} — ${err.message}` : label;
        console.error('[ThunderTV] native playback error:', detail);
        void advanceChain(video, detail, token);
    };
    // Earlier engines in the chain keep emitting for a while after they are
    // torn down (mpegts.js in particular fires its fatal callback during
    // destroy), so without this the failures of attempts 1 and 2 were still
    // being reported after attempt 3 was already on screen and playing —
    // "Playback failed:" over a perfectly good picture.
    const onPlaying = (): void => {
        playing = true;
        reportPlaybackError(null);
    };
    video.addEventListener('error', handler);
    video.addEventListener('playing', onPlaying);
    nativeErrorHandler = handler;
    nativePlayingHandler = onPlaying;
    nativeErrorVideo = video;
}

function appendStreamProbe(baseDetail: string, token: number): void {
    const url = lastStreamUrl;
    if (!url) return;
    void describeStream(url).then(async (summary) => {
        // The probe is a network round trip, so a later attempt in the chain
        // — or an entirely different channel the viewer has since picked —
        // routinely gets a picture up before it answers. Reporting then would
        // put a failure notice over a stream the user is watching.
        if (playing || isStale(token)) return;
        reportPlaybackError(`${baseDetail} — ${summary}`);
        // A 404 from the provider is either a stale catalog (panels
        // renumber stream ids routinely) or the panel refusing streams to
        // cloud/proxy IPs while allowing the API — refresh distinguishes
        // them: fresh ids that still 404 point at IP blocking.
        if (summary.includes('HTTP 404')) {
            const outcome = await refreshActiveXtreamSource('error');
            if (playing || isStale(token)) return;
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

/**
 * Every attach starts by fully stopping whatever was playing — `detach()`
 * tears the engines down *and* the `<video>` element itself, and bumps
 * `attachToken` so an attach still in flight can no longer touch either.
 */
export async function attachAndPlay(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    detach(video);
    const token = attachToken;
    reportPlaybackError(null);
    baseStreamUrl = streamUrl;
    chain = attemptChain(preferredEngine());
    chainIndex = 0;
    failures = [];
    playing = false;
    attachNativeErrorReporting(video, token);
    monitorStreamHealth(video);
    await runCurrentAttempt(video, token);
}

/** Runs `chain[chainIndex]`; engine failures call `advanceChain()`, which re-enters here until the chain is exhausted. */
async function runCurrentAttempt(video: HTMLVideoElement, token: number): Promise<void> {
    const engine = chain[chainIndex];
    const base = baseStreamUrl;
    if (!engine || !base || isStale(token)) return;

    if (engine === 'mpegts') {
        const url = tsFormOf(base);
        lastStreamUrl = url;
        const result = await attachMpegts(video, url, {
            buffering: get<BufferingMode | null>(SETTINGS_BUFFERING) ?? 'auto',
            // Re-checked inside `attachMpegts()` after its own dynamic
            // import, so a superseded attempt never destroys the player that
            // replaced it.
            isStale: () => isStale(token),
            onFatalError: (detail) => {
                void advanceChain(video, detail, token);
            },
        });
        if (isStale(token)) return;
        if (!result.ok) await advanceChain(video, result.reason ?? 'mpegts unavailable', token);
        else setActiveTrackEngine(MPEGTS_TRACK_ENGINE);
        return;
    }

    if (engine === 'native') {
        lastStreamUrl = base;
        video.src = base;
        const native = createNativeTrackEngine(video);
        setActiveTrackEngine(native.engine, native.dispose);
        await video.play().catch(() => undefined);
        return;
    }

    const url = hlsFormOf(base);
    lastStreamUrl = url;
    if (supportsNativeHls(video)) {
        video.src = url;
        const native = createNativeTrackEngine(video);
        setActiveTrackEngine(native.engine, native.dispose);
        await video.play().catch(() => undefined);
        return;
    }

    const { default: HlsCtor } = await import('hls.js');
    // The import can outlive the channel that asked for it; attaching now
    // would put a second MediaSource on an element another stream owns.
    if (isStale(token)) return;
    if (!HlsCtor.isSupported()) {
        await advanceChain(video, 'hls.js unsupported on this device', token);
        return;
    }

    const instance = new HlsCtor();
    hls = instance;
    instance.loadSource(url);
    instance.attachMedia(video);
    const { engine: hlsTrackEngine, notifyTracksChanged } = createHlsTrackEngine(instance);
    setActiveTrackEngine(hlsTrackEngine);
    instance.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, notifyTracksChanged);
    instance.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, notifyTracksChanged);
    instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        if (isStale(token)) return;
        notifyTracksChanged();
        void video.play().catch(() => undefined);
    });
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || isStale(token)) return;
        console.error('[ThunderTV] hls.js fatal error:', data.type, data.details);
        void advanceChain(video, `${String(data.type)}: ${String(data.details)}`, token);
    });
}

/**
 * One engine failed: tear it down and try the next in the chain. Only the
 * last failure is reported (with a probe) — the intermediate ones are
 * expected noise when the preference does not match the provider's format.
 */
async function advanceChain(video: HTMLVideoElement, detail: string, token: number): Promise<void> {
    // A callback from a stream the viewer has already switched away from:
    // its chain is gone, and advancing the *current* one would tear down a
    // stream that is fine.
    if (isStale(token)) return;
    // A stream that is already playing has no failure to report: this is a
    // late callback from an engine the chain moved past. A stream that
    // played and then genuinely died still gets through — the element
    // carries a MediaError in that case.
    if (playing && !video.error) return;

    failures.push(detail);
    detachEngines();
    chainIndex += 1;
    if (chainIndex < chain.length) {
        await runCurrentAttempt(video, token);
        return;
    }
    const summary = failures.join('; ');
    reportPlaybackError(summary);
    appendStreamProbe(summary, token);
}

function detachEngines(): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    detachMpegts();
    setActiveTrackEngine(null);
}

/** Track listing/selection for whichever engine attached the current stream — the empty snapshot when nothing is attached, or the attached engine has none to offer. */
export function getPlayerTracks(): TrackSnapshot {
    return activeTrackEngine?.getTracks?.() ?? { audio: [], subtitles: [] };
}

export function setAudioTrack(id: string): void {
    activeTrackEngine?.setAudioTrack?.(id);
}

/** `null` turns subtitles off. */
export function setSubtitleTrack(id: string | null): void {
    activeTrackEngine?.setSubtitleTrack?.(id);
}

/** Single-listener: replaces any previously registered callback, and is re-applied to whichever engine becomes active next (chain fallback, channel switch). */
export function onTracksChanged(cb: () => void): void {
    tracksChangedListener = cb;
    activeTrackEngine?.onTracksChanged?.(cb);
}

/**
 * Stops the element itself, not just the engine feeding it. mpegts.js and
 * hls.js hand the `<video>` a MediaSource (an object-URL `src`, or
 * `srcObject` on newer hls.js), and destroying the engine does not reliably
 * take that with it — a stale MediaSource keeps a decoder and its GPU
 * surfaces alive for a stream nobody is watching — which is what Chromium's
 * "non-existent mailbox"/"Invalid mailbox" errors report once the next
 * stream attaches on top. Pause first: `load()` on a still-playing element
 * is what leaves the old pipeline half-torn-down.
 */
function stopVideoElement(video: HTMLVideoElement): void {
    try {
        video.pause();
    } catch {
        // A half-initialized element can throw here; never let that stop the
        // rest of the teardown.
    }
    if (video.srcObject) video.srcObject = null;
    video.removeAttribute('src');
    // `removeAttribute` alone leaves the previously resolved URL loaded —
    // `load()` is what makes the element let go of it.
    video.load();
}

/**
 * Full stop: engines, health monitor, element, and the chain state. Bumps
 * `attachToken`, so an attach still waiting on a dynamic import resumes
 * into a no-op instead of attaching over whatever plays next.
 */
export function detach(video: HTMLVideoElement): void {
    attachToken += 1;
    stopStreamHealthMonitor();
    detachEngines();
    playing = false;
    baseStreamUrl = null;
    lastStreamUrl = null;
    chain = [];
    chainIndex = 0;
    failures = [];
    if (nativeErrorVideo) {
        if (nativeErrorHandler) nativeErrorVideo.removeEventListener('error', nativeErrorHandler);
        if (nativePlayingHandler) nativeErrorVideo.removeEventListener('playing', nativePlayingHandler);
        nativeErrorHandler = null;
        nativePlayingHandler = null;
        nativeErrorVideo = null;
    }
    stopVideoElement(video);
}

/** Test-only reset — mirrors `resetVirtualListForTests()`'s convention (Phase 08). @internal */
export function resetPlayerEngineForTests(): void {
    attachToken = 0;
    hls = null;
    nativeErrorHandler = null;
    nativePlayingHandler = null;
    nativeErrorVideo = null;
    playing = false;
    lastStreamUrl = null;
    baseStreamUrl = null;
    chain = [];
    chainIndex = 0;
    failures = [];
    activeTrackEngine = null;
    activeTrackEngineDispose = null;
    tracksChangedListener = null;
}
