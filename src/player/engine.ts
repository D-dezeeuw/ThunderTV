import type Hls from 'hls.js';
import { strings } from '../app/strings';
import { reportPlaybackError } from '../state/player.actions';
import { SETTINGS_BUFFERING, type BufferingMode, type PlaybackEngine } from '../state/settings';
import { get } from '../state/typed';
import { appendStreamProbe, describeMediaError } from './engine-report';
import { attemptChain, hlsFormOf, preferredEngine, supportsNativeHls, tsFormOf } from './engine-select';
import { createHlsTrackEngine } from './hls-tracks';
import { clearExternalSubtitles } from './external-subs';
import { attachMpegts, detachMpegts } from './mpegts-engine';
import { createNativeTrackEngine } from './native-tracks';
import type { PlayerEngine } from './player-engine';
import { stopPositionMonitor, trackPlaybackPosition } from './position';
import { monitorStreamHealth, reportAttachFailed, stopStreamHealthMonitor } from './stream-health';
import { detachTranscode } from './transcode-lazy';
import type { TrackSnapshot } from './tracks';

/**
 * Driving the shared `<video>`: run whichever engine `engine-select.ts`
 * chose, and fall through to the next when it fails. That file holds the
 * decision (which engine, which URL form, and why a movie must never reach
 * a demuxer); this one holds the element, the teardown, and the reporting.
 *
 * Fatal failures report through `reportPlaybackError()` (rendered in the
 * player bar) with a probe of what the provider actually sent — on a phone
 * there is no devtools console, so a dead stream must say why on screen.
 *
 * `attachToken` below is bumped by every `attachAndPlay()`/`detach()`. Attaching is asynchronous
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
let nativeMetadataHandler: (() => void) | null = null;
let nativeErrorVideo: HTMLVideoElement | null = null;
let lastStreamUrl: string | null = null;
/** True once the current attach has produced actual playback — see `advanceChain()`. */
let playing = false;
/** The URL as baked in the catalog; each attempt derives its own `.ts`/`.m3u8` form from it. */
let baseStreamUrl: string | null = null;
let chain: PlaybackEngine[] = [];
let chainIndex = 0;
let failures: string[] = [];
/** False for a movie/episode: mpegts.js needs it to treat the URL as a finite file rather than an endless feed. */
let liveStream = true;
/**
 * Deadline for the *last* attempt in the chain, which is the only one with
 * nothing behind it: a `<video>` handed a URL that never yields decodable
 * data emits neither `error` nor frames, so the browser's own spinner sits
 * there forever with nothing in the app able to say why. Earlier attempts
 * are left alone on purpose — a live channel on weak Wi-Fi can take a while
 * to fill a 4 MB stash, and a scary message over a merely slow stream is
 * worse than none.
 */
const LAST_ATTEMPT_TIMEOUT_MS = 20_000;
let attemptTimer: ReturnType<typeof setTimeout> | null = null;

/** The track-control surface of whichever attempt is currently attached, if it exposes one — see `player-engine.ts`. */
let activeTrackEngine: PlayerEngine | null = null;
/** Cleanup for `activeTrackEngine`'s own listeners (native's `textTracks`/`audioTracks` `addtrack`/`change`); `null` when the engine needs none (hls.js/mpegts — `hls.destroy()`/`detachMpegts()` already tear those down). */
let activeTrackEngineDispose: (() => void) | null = null;
/** The (single) external subscriber registered via `onTracksChanged()` below — re-applied to each new `activeTrackEngine` so it survives a chain fallback or a channel switch. */
let tracksChangedListener: (() => void) | null = null;

/** True once a newer `attachAndPlay()`/`detach()` has superseded the attach that took `token`. */
function isStale(token: number): boolean {
    return token !== attachToken;
}

/** The element's own tracks — the native attempts' engine, and mpegts.js's too (it has no track API and adds nothing to `video.textTracks`, but a subtitle file the viewer loaded is a real `<track>` on that element and belongs in the menu whatever is feeding it — `external-subs.ts`). */
function attachElementTracks(video: HTMLVideoElement): void {
    const native = createNativeTrackEngine(video);
    setActiveTrackEngine(native.engine, native.dispose);
}

function setActiveTrackEngine(engine: PlayerEngine | null, dispose: (() => void) | null = null): void {
    activeTrackEngineDispose?.();
    activeTrackEngine = engine;
    activeTrackEngineDispose = dispose;
    if (tracksChangedListener) engine?.onTracksChanged?.(tracksChangedListener);
}

/**
 * A `<video>` element error covers both the native attempts and the
 * MSE-fed ones (mpegts.js/hls.js push into the same element), so it routes
 * through `advanceChain()` like any other engine failure — which reports
 * and probes once the chain is exhausted.
 */
function attachNativeErrorReporting(video: HTMLVideoElement, token: number): void {
    const handler = (): void => {
        const detail = describeMediaError(video.error, lastStreamUrl);
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
        clearAttemptTimer();
        reportPlaybackError(null);
    };
    // Metadata means the container parsed, so the deadline has done its job
    // — anything after that is the `error` handler's and the health
    // monitor's. Deliberately NOT `progress`, which fires happily while the
    // browser downloads something it will never decode.
    const onLoadedMetadata = (): void => {
        clearAttemptTimer();
    };
    video.addEventListener('error', handler);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    nativeErrorHandler = handler;
    nativePlayingHandler = onPlaying;
    nativeMetadataHandler = onLoadedMetadata;
    nativeErrorVideo = video;
}

function clearAttemptTimer(): void {
    if (attemptTimer === null) return;
    clearTimeout(attemptTimer);
    attemptTimer = null;
}

/** Arms `LAST_ATTEMPT_TIMEOUT_MS` only when there is nothing left to fall back to — see the constant. */
function armLastAttemptTimer(video: HTMLVideoElement, token: number): void {
    clearAttemptTimer();
    if (chainIndex < chain.length - 1) return;
    attemptTimer = setTimeout(() => {
        attemptTimer = null;
        if (isStale(token) || playing) return;
        // Nothing is torn down here: the element is left loading, so a
        // stream that is merely very slow still clears this message itself
        // via `onPlaying` when it finally starts.
        void advanceChain(video, strings.list.playerNoDataYet, token);
    }, LAST_ATTEMPT_TIMEOUT_MS);
}

/**
 * Every attach starts by fully stopping whatever was playing — `detach()`
 * tears the engines down *and* the `<video>` element itself, and bumps
 * `attachToken` so an attach still in flight can no longer touch either.
 */
export async function attachAndPlay(
    video: HTMLVideoElement,
    streamUrl: string,
    options: AttachOptions = {},
): Promise<void> {
    detach(video);
    const token = attachToken;
    reportPlaybackError(null);
    baseStreamUrl = streamUrl;
    liveStream = options.live ?? true;
    chain = attemptChain(preferredEngine(), streamUrl);
    chainIndex = 0;
    failures = [];
    playing = false;
    attachNativeErrorReporting(video, token);
    monitorStreamHealth(video, streamUrl);
    trackPlaybackPosition(video, streamUrl, liveStream);
    await runCurrentAttempt(video, token);
}

export interface AttachOptions {
    /**
     * An endless feed rather than a finite file. Defaults to `true`: every
     * caller predating Movies/Series plays a live channel, and a snapshot
     * stored before `ActiveChannelSnapshot.kind` existed omits it. The
     * caller's to state, not the player's to re-derive from a URL.
     */
    live?: boolean;
}

/** Runs `chain[chainIndex]`; engine failures call `advanceChain()`, which re-enters here until the chain is exhausted. */
async function runCurrentAttempt(video: HTMLVideoElement, token: number): Promise<void> {
    const engine = chain[chainIndex];
    const base = baseStreamUrl;
    if (!engine || !base || isStale(token)) return;
    armLastAttemptTimer(video, token);

    if (engine === 'mpegts') {
        const url = tsFormOf(base);
        lastStreamUrl = url;
        const result = await attachMpegts(video, url, {
            buffering: get<BufferingMode | null>(SETTINGS_BUFFERING) ?? 'auto',
            isLive: liveStream,
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
        else attachElementTracks(video);
        return;
    }

    if (engine === 'native') {
        lastStreamUrl = base;
        video.src = base;
        attachElementTracks(video);
        await video.play().catch(() => undefined);
        return;
    }

    const url = hlsFormOf(base);
    lastStreamUrl = url;
    if (supportsNativeHls(video)) {
        video.src = url;
        attachElementTracks(video);
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

    // Whatever this failure is, it arrived before the deadline could fire —
    // leaving the timer armed would report a second, contradictory reason
    // once the chain has already given its real one.
    clearAttemptTimer();
    failures.push(detail);
    detachEngines();
    chainIndex += 1;
    if (chainIndex < chain.length) {
        await runCurrentAttempt(video, token);
        return;
    }
    const summary = failures.join('; ');
    reportPlaybackError(summary);
    // Stone 3's failure evidence, recorded once the whole chain is spent —
    // not per attempt. One channel that needed three engines before giving
    // up is one failure for that feed, not three.
    reportAttachFailed();
    appendStreamProbe(lastStreamUrl, summary, () => playing || isStale(token));
}

function detachEngines(): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    detachMpegts();
    // The desktop audio-transcode route feeds this element through a
    // MediaSource of its own, started outside the chain (`transcode-fallback.ts`).
    detachTranscode();
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
    clearExternalSubtitles();
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
    stopPositionMonitor();
    clearAttemptTimer();
    detachEngines();
    playing = false;
    liveStream = true;
    baseStreamUrl = null;
    lastStreamUrl = null;
    chain = [];
    chainIndex = 0;
    failures = [];
    if (nativeErrorVideo) {
        if (nativeErrorHandler) nativeErrorVideo.removeEventListener('error', nativeErrorHandler);
        if (nativePlayingHandler) nativeErrorVideo.removeEventListener('playing', nativePlayingHandler);
        if (nativeMetadataHandler) nativeErrorVideo.removeEventListener('loadedmetadata', nativeMetadataHandler);
        nativeErrorHandler = null;
        nativePlayingHandler = null;
        nativeMetadataHandler = null;
        nativeErrorVideo = null;
    }
    stopVideoElement(video);
}

/** Test-only reset — mirrors `resetVirtualListForTests()`'s convention (Phase 08). @internal */
export function resetPlayerEngineForTests(): void {
    attachToken = 0;
    hls = null;
    clearAttemptTimer();
    nativeErrorHandler = null;
    nativePlayingHandler = null;
    nativeMetadataHandler = null;
    nativeErrorVideo = null;
    playing = false;
    liveStream = true;
    lastStreamUrl = null;
    baseStreamUrl = null;
    chain = [];
    chainIndex = 0;
    failures = [];
    activeTrackEngine = null;
    activeTrackEngineDispose = null;
    tracksChangedListener = null;
}
