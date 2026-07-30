/**
 * The visualizer's read-only tap on whatever the shared `<video>` is
 * playing — and the one rule the module exists to enforce: **listening must
 * never change what comes out of the speakers.**
 *
 * The original implementation used `createMediaElementSource(video)`, which
 * does the opposite. That node *re-routes* the element's audio: from the
 * moment it exists, the element no longer plays to the speakers at all, only
 * into the graph — and per the Web Audio spec (and Chromium's
 * `MediaElementAudioSource outputs zeroes due to CORS access restrictions`
 * console warning) it outputs **silence** whenever the element's current
 * resource is CORS-cross-origin. The node cannot be undone: one call marks
 * that `<video>` for the life of the page.
 *
 * That is exactly the shape of "movies have no sound". Live TV and Radio
 * reach the element through mpegts.js/hls.js as a `blob:` MediaSource, which
 * counts as same-origin, so they stay audible and the source node gets
 * created while they play. A movie is a progressive file handed straight to
 * the element (`engine-select.ts`: `video.src = <provider URL>`), which is
 * cross-origin — so after any Radio station or any audio-only TV channel,
 * every VOD title afterwards played picture-perfect and dead silent.
 *
 * `captureStream()` is the same data without the hijack: it hands out a
 * *copy* of what the element plays and leaves the element's own output alone,
 * so the analyser is fed from a branch that can be silent, absent or blocked
 * without costing the viewer any sound. Nothing here ever connects to
 * `ctx.destination` for that reason — the element is still the thing playing.
 * An `AnalyserNode` with no downstream connection still runs (the spec's
 * automatic-pull list exists for exactly this), so the visualizer reads real
 * data from a graph that is audibly inert.
 *
 * When capture is unavailable (Safari ships no `captureStream()`), or the
 * resource is tainted, or the stream simply has no audio track yet, callers
 * get `SILENT_TAP` instead of `null`: zeroed spectrum, centred waveform. The
 * presets then animate at rest, which is the documented degradation — and
 * the audio keeps playing, which is the point.
 */

/** 2048 at 48 kHz is ~23 Hz per bin — enough low-end resolution for the log-spaced bars to separate a kick from a bassline. */
export const FFT_SIZE = 2048;
export const BIN_COUNT = FFT_SIZE / 2;
/** Stand-in for `AudioContext.sampleRate` while no live graph exists; only feeds `audio-features.ts`'s bin→Hz mapping, which has nothing to map when the tap is silent anyway. */
export const DEFAULT_SAMPLE_RATE = 48_000;

export interface AudioTap {
    /** False for the silent stand-in — the render loop still runs, it just has nothing to react to. */
    readonly live: boolean;
    readonly sampleRate: number;
    /** Fills both buffers with the current frame: byte spectrum, byte waveform. */
    read(freq: Uint8Array, wave: Uint8Array): void;
}

export const SILENT_TAP: AudioTap = {
    live: false,
    sampleRate: DEFAULT_SAMPLE_RATE,
    read(freq: Uint8Array, wave: Uint8Array): void {
        freq.fill(0);
        // 128 is the zero line of a byte time-domain buffer, not 0 — an
        // all-zero waveform reads as a hard-clipped square wave to any
        // preset drawing it.
        wave.fill(128);
    },
};

/** `captureStream()` is unprefixed in Chromium and `mozCaptureStream()` in Firefox; Safari ships neither, which is the `SILENT_TAP` path. */
interface CapturableVideo extends HTMLVideoElement {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
}

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let tappedVideo: HTMLVideoElement | null = null;
/** Identity of the *stream* the current tap was built for, so a new channel/movie on the same element rebuilds instead of analysing a dead capture. */
let tappedKey: string | null = null;
/** True while waiting for an audio track to show up on a capture taken before the element had one — stops every call re-capturing. */
let awaitingAudio = false;

const LIVE_TAP: AudioTap = {
    live: true,
    get sampleRate(): number {
        return ctx?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    },
    read(freq: Uint8Array, wave: Uint8Array): void {
        if (!analyser) {
            SILENT_TAP.read(freq, wave);
            return;
        }
        analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
        analyser.getByteTimeDomainData(wave as Uint8Array<ArrayBuffer>);
    },
};

/** Each engine gives the element a different `src` per stream (`blob:` MediaSource for mpegts.js/hls.js, the provider URL for a progressive file), so `currentSrc` is a usable per-stream identity. */
function streamKeyOf(video: HTMLVideoElement): string {
    return video.currentSrc || (video.srcObject ? 'srcObject' : '');
}

function capture(video: HTMLVideoElement): MediaStream | null {
    const el = video as CapturableVideo;
    const fn = el.captureStream ?? el.mozCaptureStream;
    if (typeof fn !== 'function') return null;
    try {
        return fn.call(el);
    } catch {
        // Chromium throws here for a cross-origin (tainted) resource. The
        // element keeps playing; only the visualizer goes idle.
        return null;
    }
}

function releaseGraph(): void {
    try {
        source?.disconnect();
    } catch {
        // A context torn down elsewhere can throw on disconnect; nothing here
        // depends on it succeeding.
    }
    source = null;
    analyser = null;
    awaitingAudio = false;
}

function buildGraph(stream: MediaStream): boolean {
    if (typeof AudioContext === 'undefined') return false;
    try {
        const audioCtx = ctx ?? new AudioContext();
        ctx = audioCtx;
        const node = audioCtx.createMediaStreamSource(stream);
        const node2 = audioCtx.createAnalyser();
        node2.fftSize = FFT_SIZE;
        // 0.7, not the 0.82 default: more smoothing pre-smears onsets until
        // the beat detector has nothing left to detect. The decibel range is
        // widened from the -100/-30 defaults because -30 clips a loud
        // stream's bass bins flat at 255 — `audio-features.ts`'s auto-gain
        // handles quiet streams, so the analyser only has to not clip.
        node2.smoothingTimeConstant = 0.7;
        node2.minDecibels = -90;
        node2.maxDecibels = -15;
        node.connect(node2);
        // Deliberately NOT `node2.connect(audioCtx.destination)`: the element
        // is already playing to the speakers, and this graph is a copy.
        source = node;
        analyser = node2;
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return true;
    } catch {
        releaseGraph();
        return false;
    }
}

/**
 * The tap for `video`'s current stream — never null, so the render loop
 * always has something to read. Rebuilds whenever the element starts a new
 * stream. `onUpgrade` fires if a capture that had no audio track yet grows
 * one (the usual case: the visualizer starts the same tick the stream
 * attaches), so the caller can swap its silent tap for the live one.
 */
export function ensureAudioTap(video: HTMLVideoElement, onUpgrade?: () => void): AudioTap {
    const key = streamKeyOf(video);
    if (tappedVideo === video && tappedKey === key) {
        if (analyser) {
            if (ctx?.state === 'suspended') void ctx.resume();
            return LIVE_TAP;
        }
        if (awaitingAudio) return SILENT_TAP;
    }

    releaseGraph();
    tappedVideo = video;
    tappedKey = key;

    const stream = capture(video);
    if (!stream) return SILENT_TAP;
    if (stream.getAudioTracks().length === 0) {
        awaitingAudio = true;
        stream.addEventListener('addtrack', function onAddTrack() {
            stream.removeEventListener('addtrack', onAddTrack);
            // The viewer may have switched streams while we waited; that
            // capture belongs to a stream nobody is playing any more.
            if (tappedVideo !== video || tappedKey !== streamKeyOf(video)) return;
            awaitingAudio = false;
            if (stream.getAudioTracks().length > 0 && buildGraph(stream)) onUpgrade?.();
        });
        return SILENT_TAP;
    }
    return buildGraph(stream) ? LIVE_TAP : SILENT_TAP;
}

/** Test-only reset — mirrors `resetRadioVisualizerForTests()`'s convention. @internal */
export function resetAudioTapForTests(): void {
    releaseGraph();
    ctx = null;
    tappedVideo = null;
    tappedKey = null;
}
