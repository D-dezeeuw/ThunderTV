import { refs } from 'spektrum';
import { AudioFeatures } from './audio-features';
import { BeatDetector } from './beat-detector';
import { CrossFader } from './crossfade';
import { createRadioVisualizerPresets } from './presets/index';
import type { VisualizerPreset } from './types';

/**
 * Fullscreen radio visualizer: canvas 2D, a small rotation of presets (see
 * `presets/index.ts`) driven by the shared `<video>` element's Web Audio
 * output — Radio's answer to "something to look at on a TV" while a station
 * plays. `bindings.ts` starts/stops it whenever `view.radio.active` and
 * `player.active` change; this module owns the Web Audio graph, canvas
 * sizing, beat detection, and preset cycling, and leaves each preset's own
 * visuals to its own file.
 *
 * CORS caveat: a `MediaElementAudioSourceNode` reads real frequency data
 * only when the element's audio is same-origin or CORS-clean.
 * mpegts.js/hls.js (the default engines, `src/player/engine.ts`) feed the
 * shared `<video>` via a `blob:` MediaSource URL, which counts as
 * same-origin, so the analyser sees real data for the common case. The
 * native-engine fallback assigns the raw cross-origin stream URL directly to
 * `video.src`; there the browser zeroes analyser output as a fingerprinting
 * guard, and every preset just idles (still animated, at rest) instead of
 * erroring.
 */

/** How long each preset plays before auto-advancing — long enough to actually look at, short enough that an unattended TV doesn't stall on one preset all evening. */
const AUTO_CYCLE_MS = 25_000;

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceVideo: HTMLVideoElement | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let waveData: Uint8Array<ArrayBuffer> | null = null;
let sampleRate = 48_000;
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedCanvas: HTMLCanvasElement | null = null;
/** True while the listener has paused the visualizer — the render loop just isn't scheduled, so the last drawn frame stays on screen. */
let paused = false;

const beatDetector = new BeatDetector();
const audioFeatures = new AudioFeatures();
let presets: VisualizerPreset[] = createRadioVisualizerPresets();
let presetIndex = 0;
let presetElapsedMs = 0;
let activePresetCanvas: HTMLCanvasElement | null = null;
/** Non-null when the listener picked a specific preset (e.g. a genre) rather than "Auto" — see `setRadioVisualizerPreset()`. */
let pinnedPresetId: string | null = null;

const crossFader = new CrossFader();

let lastTs: number | null = null;

/**
 * fftSize 2048 (not 1024): at 48 kHz that's ~23 Hz per bin, enough low-end
 * resolution for the log-spaced bars to separate kick from bassline.
 * smoothing 0.7 (not 0.82): the old value pre-smeared onsets so much the
 * beat detector had nothing to detect. min/max decibels widened from the
 * -100/-30 defaults: -30 as the ceiling clips loud radio streams' bass
 * bins flat at 255, which broke both the bars and beat detection — the
 * auto-gain in audio-features.ts handles quiet streams, so the analyser
 * itself just needs to not clip.
 */
function configureAnalyser(node: AnalyserNode): void {
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.7;
    node.minDecibels = -90;
    node.maxDecibels = -15;
}

/**
 * (Re)creates the Web Audio graph against `video`, reusing it across
 * start/stop cycles. `createMediaElementSource()` may only ever be called
 * once per media element, so this is a no-op past the first call for a
 * given `<video>` node — which is the shared, long-lived player element
 * (`src/player/engine.ts`'s sole attach point), never recreated per channel.
 */
function ensureAudioGraph(video: HTMLVideoElement): AnalyserNode | null {
    if (sourceVideo === video && audioCtx && analyser) {
        configureAnalyser(analyser);
        if (freqData?.length !== analyser.frequencyBinCount) {
            freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        if (waveData?.length !== analyser.fftSize) {
            waveData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        }
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return analyser;
    }
    try {
        const ctx = audioCtx ?? new AudioContext();
        audioCtx = ctx;
        sampleRate = ctx.sampleRate;
        const node = ctx.createMediaElementSource(video);
        const analyserNode = ctx.createAnalyser();
        configureAnalyser(analyserNode);
        node.connect(analyserNode);
        // A MediaElementAudioSourceNode routes the element's audio
        // exclusively through the graph it's connected to (spec behavior) —
        // without this the station goes silent the moment the visualizer
        // starts.
        analyserNode.connect(ctx.destination);
        analyser = analyserNode;
        sourceVideo = video;
        freqData = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
        waveData = new Uint8Array(new ArrayBuffer(analyserNode.fftSize));
        if (ctx.state === 'suspended') void ctx.resume();
        return analyserNode;
    } catch (err) {
        console.error('[ThunderTV] radio visualizer: audio graph unavailable:', err);
        return null;
    }
}

function sizeCanvas(canvas: HTMLCanvasElement): boolean {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
}

function observeSize(canvas: HTMLCanvasElement): void {
    if (observedCanvas === canvas) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
        // A resized canvas invalidates any preset's offscreen buffers
        // (particle bounds, the kaleidoscope wedge, the fractal tunnel's
        // history frame) — every preset's `reset()` re-derives from the new
        // dimensions, not just the one currently active. A resize mid-
        // crossfade abandons the fade and lands on the incoming preset
        // (`presetIndex` already points at it).
        if (sizeCanvas(canvas)) {
            crossFader.cancel();
            presets[presetIndex]?.reset(canvas.width, canvas.height);
        }
    });
    resizeObserver.observe(canvas);
    observedCanvas = canvas;
}

function render(
    ts: number,
    canvas: HTMLCanvasElement,
    node: AnalyserNode,
    data: Uint8Array<ArrayBuffer>,
    wave: Uint8Array<ArrayBuffer>,
): void {
    rafId = requestAnimationFrame((next) => render(next, canvas, node, data, wave));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    node.getByteFrequencyData(data);
    node.getByteTimeDomainData(wave);

    const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 64);
    lastTs = ts;

    presetElapsedMs += dt;
    // A pinned preset (the listener picked a genre explicitly) never
    // auto-advances away — only "Auto" in the picker keeps the rotation
    // going. Never starts a second fade on top of one already playing.
    if (!crossFader.running && !pinnedPresetId && presetElapsedMs >= AUTO_CYCLE_MS) {
        beginTransition(canvas, (presetIndex + 1) % presets.length);
    }

    const { bass, mid, treble, energy } = audioFeatures.update(data, dt, sampleRate);
    const { beat, intensity: beatIntensity } = beatDetector.update(bass, dt);
    const shared = {
        width: canvas.width,
        height: canvas.height,
        ts,
        dt,
        data,
        wave,
        bars: audioFeatures.bars,
        bass,
        mid,
        treble,
        energy,
        beat,
        beatIntensity,
    };

    const blended = crossFader.render(ctx, canvas, dt, (index, target) => {
        presets[index]?.frame({ ...shared, ctx: target });
    });
    if (!blended) presets[presetIndex]?.frame({ ...shared, ctx });
}

/** Starts a crossfade to `toIndex`, leaving the outgoing preset running (untouched) so it keeps animating while it fades out; the incoming preset is reset immediately so it starts clean. A no-op if already there or mid-fade to it. */
function beginTransition(canvas: HTMLCanvasElement, toIndex: number): void {
    if (toIndex === presetIndex || (crossFader.running && crossFader.target === toIndex)) return;
    presets[toIndex]?.reset(canvas.width, canvas.height);
    crossFader.begin(canvas, presetIndex, toIndex);
    presetIndex = toIndex;
    presetElapsedMs = 0;
}

/**
 * Manual "next preset" — the `player/nextVisualizerPreset` action's entry
 * point. Always advances past a pin (browsing forward is an explicit
 * override of "stay on this genre"); `player.actions.ts` also resets the
 * `player.visualizerPreset` setting to `'auto'` in the same click so the
 * picker's displayed value doesn't drift from what's actually on screen.
 * A no-op while the visualizer isn't running.
 */
export function cycleRadioVisualizerPreset(): void {
    if (!activePresetCanvas) return;
    pinnedPresetId = null;
    beginTransition(activePresetCanvas, (presetIndex + 1) % presets.length);
}

/**
 * Applies the listener's preset preference (`player.visualizerPreset`,
 * `'auto'` or a preset id). `'auto'` just clears the pin and lets the
 * existing rotation continue; a specific id pins to that preset and
 * crossfades to it immediately — switching now, not waiting for the current
 * preset's turn to end.
 */
export function setRadioVisualizerPreset(preference: string): void {
    if (preference === 'auto') {
        pinnedPresetId = null;
        return;
    }
    const index = presets.findIndex((p) => p.id === preference);
    if (index === -1) return;
    pinnedPresetId = preference;
    if (activePresetCanvas) {
        beginTransition(activePresetCanvas, index);
        return;
    }
    // Not running yet (e.g. picked while parked on another view) — just
    // land on it directly next time `startRadioVisualizer()` runs.
    presetIndex = index;
    presetElapsedMs = 0;
}

/** Pauses or resumes the render loop — freezing the last drawn frame in place rather than blanking the canvas. `startRadioVisualizer()` respects a pause already in effect (e.g. set before Radio became active) and stays frozen until resumed. */
export function setRadioVisualizerPaused(value: boolean): void {
    paused = value;
    if (paused) {
        stopRadioVisualizerLoop();
        return;
    }
    if (!activePresetCanvas || !analyser || !freqData || !waveData || rafId !== null) return;
    lastTs = null;
    const canvas = activePresetCanvas;
    const node = analyser;
    const data = freqData;
    const wave = waveData;
    rafId = requestAnimationFrame((ts) => render(ts, canvas, node, data, wave));
}

/**
 * Starts (or resumes) the visualizer against `[data-ref="radioVisualizer"]`.
 * A no-op if that canvas isn't mounted or the audio graph can't be created
 * (e.g. an unsupported browser). Also a no-op — deliberately — if the
 * visualizer is already running against this exact canvas: `bindings.ts`
 * calls this on every change to any of several dependencies (view, preset
 * preference, pause), not only on a genuine activation, and a full reset
 * here would stomp an in-flight preset crossfade or pause state on every
 * one of those. Preset/pause changes apply through their own setters.
 */
export function startRadioVisualizer(video: HTMLVideoElement): void {
    const canvas = refs['radioVisualizer'];
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (activePresetCanvas === canvas && sourceVideo === video) return;
    const node = ensureAudioGraph(video);
    if (!node || !freqData || !waveData) return;

    stopRadioVisualizerLoop();
    sizeCanvas(canvas);
    observeSize(canvas);
    activePresetCanvas = canvas;
    crossFader.cancel();
    lastTs = null;
    presetElapsedMs = 0;
    beatDetector.reset();
    audioFeatures.reset();
    presets[presetIndex]?.reset(canvas.width, canvas.height);
    if (paused) return;
    const data = freqData;
    const wave = waveData;
    rafId = requestAnimationFrame((ts) => render(ts, canvas, node, data, wave));
}

/** Stops the render loop only — the audio graph stays connected (sound keeps playing, and the source node can't be recreated) so a later `startRadioVisualizer()` just resumes drawing, on whichever preset was active. Also drops any pause/transition in progress — leaving Radio and coming back starts clean rather than silently still-paused. */
export function stopRadioVisualizer(): void {
    stopRadioVisualizerLoop();
    activePresetCanvas = null;
    crossFader.cancel();
    paused = false;
}

function stopRadioVisualizerLoop(): void {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

/** Test-only reset — mirrors `resetPlayerEngineForTests()`'s convention. @internal */
export function resetRadioVisualizerForTests(): void {
    stopRadioVisualizerLoop();
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedCanvas = null;
    audioCtx = null;
    analyser = null;
    sourceVideo = null;
    freqData = null;
    waveData = null;
    sampleRate = 48_000;
    activePresetCanvas = null;
    paused = false;
    crossFader.reset();
    presets = createRadioVisualizerPresets();
    presetIndex = 0;
    presetElapsedMs = 0;
    pinnedPresetId = null;
    beatDetector.reset();
    audioFeatures.reset();
    lastTs = null;
}
